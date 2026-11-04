/** 对局状态机：热座发牌、暗选、盟约、结算、判胜 */
import { create } from 'zustand'
import { drawActionHand, drawFactionCards, getDesignated } from '@/utils/game/deck'
import { applyRoundModifier } from '@/utils/game/modifiers'
import { applyFactionCards, resolveRound } from '@/utils/game/resolve'
import { judgeVictory } from '@/utils/game/victory'
import { createAlliance, dissolveAlliance } from '@/utils/game/alliance'
import { createGame } from '@/utils/game/init'
import { FACTION_MAP } from '@/mocks/factions'
import { FACTION_DESIGNATED, PACT_EVENTS } from '@/mocks'
import { clearGame, loadGame, saveGame } from '@/api/gameApi'
import type { CardDef, GameState, LogEntry, Pick, PlayerState } from '@/types'

/** 从 from 开始找第一位未出局的玩家；找不到返回列表长度（交给盟约阶段） */
function nextActiveIndex(players: PlayerState[], from: number): number {
  for (let i = from; i < players.length; i += 1) {
    if (!players[i].defeated) return i
  }
  return players.length
}

interface GameStore {
  game: GameState | null
  hasBanner: boolean
  startGame: (names: string[]) => void
  beginRound: () => void
  beginPick: (index: number) => void
  submitPick: (cards: CardDef[], played: CardDef | null, kept: CardDef | null, targetId?: string | null) => void
  formAlliance: (aId: string, bId: string) => void
  breakAlliance: (id: string) => void
  resolve: () => void
  nextRound: () => void
  takeFactionCard: (playerId: string, cardId: string | null) => void
  resume: () => boolean
  reset: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  hasBanner: false,

  startGame: (names) => {
    const game = createGame(names)
    saveGame(game)
    set({ game, hasBanner: false })
  },

  beginRound: () => {
    const { game } = get()
    if (!game) return
    // 阵营牌先于剧情修正结算
    const faction = applyFactionCards(game.players, game.factionPending)
    const players = applyRoundModifier(faction.players, game.round).map((p) => ({
      ...p,
      betrayedThisRound: false,
    }))
    const pactEvent = PACT_EVENTS[Math.floor(Math.random() * PACT_EVENTS.length)]
    const activeIndex = nextActiveIndex(players, 0)
    const next: GameState = {
      ...game,
      players,
      pactEvent,
      phase: activeIndex >= players.length ? 'council' : 'handoff',
      activeIndex,
      picks: {},
      log: [...game.log, ...game.roundLog],
      roundLog: [
        ...faction.logs.map((l) => ({ ...l, round: game.round })),
        { round: game.round, tone: 'info', text: `第 ${game.round} 回合开始。` },
      ],
      factionCardDiscard: [
        ...game.factionCardDiscard,
        ...Object.values(game.factionPending),
      ],
      factionPending: {},
    }
    saveGame(next)
    set({ game: next })
  },

  beginPick: (index) => {
    const { game } = get()
    if (!game) return
    const player = game.players[index]
    if (!player) return
    const hand = drawActionHand(
      game.deck[player.id],
      game.discard[player.id],
      game.neutralDeck,
      game.neutralDiscard,
    )
    // 指定牌是静态卡：直接从本阵营指定牌表拼进手牌，不进入任何牌堆
    const designated = getDesignated(
      player.factionId,
      game.round,
      FACTION_DESIGNATED[player.factionId],
    )
    const next: GameState = {
      ...game,
      deck: { ...game.deck, [player.id]: hand.factionDeck },
      discard: { ...game.discard, [player.id]: hand.factionDiscard },
      neutralDeck: hand.neutralDeck,
      neutralDiscard: hand.neutralDiscard,
      hand: designated ? [...hand.hand, designated] : hand.hand,
      activeIndex: index,
      phase: 'picking',
    }
    // 发牌结果必须落盘，否则暗选期间刷新会拿到空手牌
    saveGame(next)
    set({ game: next })
  },

  submitPick: (cards, played, kept, targetId) => {
    const { game } = get()
    if (!game) return
    const player = game.players[game.activeIndex]
    if (!player) return
    const pick: Pick = { cards, designated: played, kept, targetId: targetId ?? null }
    const players = game.players.map((p) =>
      p.id === player.id ? { ...p, heldDesignated: kept } : p,
    )
    const unused = game.hand.filter((c) => !cards.some((sel) => sel.id === c.id))
    // 弃牌路由按 category：中立行动牌回中立池，阵营行动牌回本人池，指定牌为静态卡直接丢弃
    const neutralUnused = unused.filter((c) => c.category === 'action' && c.owner === 'GENERIC')
    const factionUnused = unused.filter((c) => c.category === 'action' && c.owner !== 'GENERIC')
    const discard = {
      ...game.discard,
      [player.id]: [...game.discard[player.id], ...factionUnused],
    }
    const neutralDiscard = [...game.neutralDiscard, ...neutralUnused]
    const nextIndex = nextActiveIndex(players, game.activeIndex + 1)
    const next: GameState = {
      ...game,
      players,
      picks: { ...game.picks, [player.id]: pick },
      discard,
      neutralDiscard,
      hand: [],
      activeIndex: nextIndex,
      phase: nextIndex >= game.players.length ? 'council' : 'handoff',
    }
    saveGame(next)
    set({ game: next })
  },

  formAlliance: (aId, bId) => {
    const { game } = get()
    if (!game) return
    const players = createAlliance(game.players, aId, bId)
    if (!players) return
    const a = game.players.find((p) => p.id === aId)!
    const b = game.players.find((p) => p.id === bId)!
    const log: LogEntry = {
      round: game.round,
      tone: 'good',
      text: `${a.name}（${FACTION_MAP[a.factionId].name}）与 ${b.name}（${FACTION_MAP[b.factionId].name}）结盟。`,
    }
    const next = { ...game, players, roundLog: [...game.roundLog, log] }
    saveGame(next)
    set({ game: next })
  },

  breakAlliance: (id) => {
    const { game } = get()
    if (!game) return
    const result = dissolveAlliance(game.players, id)
    if (!result) return
    const a = game.players.find((p) => p.id === id)!
    const log: LogEntry = {
      round: game.round,
      tone: 'bad',
      text: `${a.name} 撕毁盟约，永久失去结盟资格；本回合背刺加成已生效。`,
    }
    const next = { ...game, players: result.players, roundLog: [...game.roundLog, log] }
    saveGame(next)
    set({ game: next })
  },

  resolve: () => {
    const { game } = get()
    if (!game) return
    const result = resolveRound(game.players, game.picks, game.round, game.pactEvent)
    const victory = judgeVictory(result.players, game.round)
    const discard = { ...game.discard }
    const neutralDiscard = [...game.neutralDiscard]
    game.players.forEach((p) => {
      const cards = game.picks[p.id]?.cards ?? []
      // 按 category 路由，指定牌不进入任何牌堆
      neutralDiscard.push(...cards.filter((c) => c.category === 'action' && c.owner === 'GENERIC'))
      discard[p.id] = [
        ...discard[p.id],
        ...cards.filter((c) => c.category === 'action' && c.owner !== 'GENERIC'),
      ]
    })

    // 已结盟、未出局、未流亡的玩家获得 2 张阵营牌候选；第 7 回合起不再发放
    const factionOffers: Record<string, CardDef[]> = {}
    let factionCardDeck = [...game.factionCardDeck]
    let factionCardDiscard = [...game.factionCardDiscard]
    if (!victory && game.round < 7) {
      result.players.forEach((p) => {
        if (p.defeated || p.exiled || !p.allyId) return
        const drawn = drawFactionCards(factionCardDeck, factionCardDiscard, 2)
        factionCardDeck = drawn.deck
        factionCardDiscard = drawn.discard
        if (drawn.cards.length > 0) factionOffers[p.id] = drawn.cards
      })
    }

    const next: GameState = {
      ...game,
      players: result.players,
      discard,
      neutralDiscard,
      factionCardDeck,
      factionCardDiscard,
      factionOffers,
      phase: 'resolved',
      roundLog: [...game.roundLog, ...result.logs],
      winner: victory?.factionId ?? null,
      winnerReason: victory?.reason ?? '',
    }
    saveGame(next)
    set({ game: next, hasBanner: Boolean(victory) })
  },

  takeFactionCard: (playerId, cardId) => {
    const { game } = get()
    if (!game) return
    const offers = game.factionOffers[playerId]
    if (!offers) return
    const factionOffers = { ...game.factionOffers }
    const factionPending = { ...game.factionPending }
    const factionCardDiscard = [...game.factionCardDiscard]
    if (cardId) {
      const chosen = offers.find((c) => c.id === cardId)
      if (!chosen) return
      factionPending[playerId] = chosen
      factionCardDiscard.push(...offers.filter((c) => c.id !== cardId))
    } else {
      factionCardDiscard.push(...offers)
    }
    delete factionOffers[playerId]
    const next: GameState = { ...game, factionOffers, factionPending, factionCardDiscard }
    saveGame(next)
    set({ game: next })
  },

  nextRound: () => {
    const { game } = get()
    if (!game) return
    // 未选择的阵营牌候选在回合衔接时回收，避免跨回合残留
    const leftover = Object.values(game.factionOffers).flat()
    if (game.winner || game.round >= 7) {
      const ended: GameState = {
        ...game,
        phase: 'result',
        factionCardDiscard: [...game.factionCardDiscard, ...leftover],
        factionOffers: {},
      }
      saveGame(ended)
      set({ game: ended })
      return
    }
    const next: GameState = {
      ...game,
      round: game.round + 1,
      phase: 'handoff',
      activeIndex: 0,
      picks: {},
      factionCardDiscard: [...game.factionCardDiscard, ...leftover],
      factionOffers: {},
    }
    set({ game: next })
    get().beginRound()
  },

  resume: () => {
    const loaded = loadGame()
    if (!loaded) return false
    // 旧存档补齐阵营牌字段
    const game: GameState = {
      ...loaded,
      factionCardDeck: loaded.factionCardDeck ?? [],
      factionCardDiscard: loaded.factionCardDiscard ?? [],
      factionOffers: loaded.factionOffers ?? {},
      factionPending: loaded.factionPending ?? {},
    }
    set({ game, hasBanner: Boolean(game.winner) })
    // 旧存档可能停在 picking 但手牌结构不符，重新发一手保证可提交
    if (game.phase === 'picking' && game.hand.length < 5) {
      get().beginPick(game.activeIndex)
    }
    return true
  },

  reset: () => {
    clearGame()
    set({ game: null, hasBanner: false })
  },
}))

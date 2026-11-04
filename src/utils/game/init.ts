/** 开局构造：分配阵营、建牌堆、生成初始对局状态 */
import { assignFactions } from './assign'
import { buildDeck, buildFactionDeck, buildNeutralDeck } from './deck'
import { makePlayer } from './player'
import type { CardDef, GameState } from '@/types'

export function createGame(names: string[]): GameState {
  const factions = assignFactions()
  const players = factions.map((f, i) => makePlayer(names[i]?.trim() || `玩家${i + 1}`, f, i))
  const deck: Record<string, CardDef[]> = {}
  const discard: Record<string, CardDef[]> = {}
  players.forEach((p) => {
    deck[p.id] = buildDeck(p.factionId)
    discard[p.id] = []
  })
  return {
    players,
    round: 1,
    phase: 'briefing',
    activeIndex: 0,
    deck,
    discard,
    neutralDeck: buildNeutralDeck(),
    neutralDiscard: [],
    factionCardDeck: buildFactionDeck(),
    factionCardDiscard: [],
    factionOffers: {},
    factionPending: {},
    factionPickQueue: [],
    factionPickerId: null,
    hand: [],
    picks: {},
    pactEvent: null,
    log: [],
    roundLog: [],
    winner: null,
    winnerReason: '',
    createdAt: Date.now(),
  }
}

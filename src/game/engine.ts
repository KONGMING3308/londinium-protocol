/**
 * 联机对局引擎：权威状态 + 全部状态迁移 + 按视角脱敏的视图生成。
 *
 * 为什么单独抽一层
 * - 服务端要用它（唯一权威）；本地热座模式也能用它（浏览器内模拟服务端），
 *   这样两套玩法共用同一份规则实现，不会出现「联机版和单机版规则不一样」。
 * - 引擎是纯函数式的：入口都是 (state, ...args) → { state, error? }，不碰网络、不碰 React。
 *   随机数可注入，便于测试与回放。
 *
 * 与原热座的差别
 * - 手牌从「单份 game.hand」改为「按玩家分开的 hands」，暗选从"逐个交接"变为"并行提交"。
 * - 盟约从"一台设备上点两下"变为"提议 → 对方同意"，因为不再有共用设备。
 * - 阵营交换从"逐对排队拍板"变为"每对同盟并行拍板"，四台设备无需排队。
 */
import { applyCollapse, applyFactionCards, clampToCap, resolveRound } from '@/utils/game/resolve'
import { judgeVictory } from '@/utils/game/victory'
import { createAlliance, dissolveAlliance } from '@/utils/game/alliance'
import { assignFactions } from '@/utils/game/assign'
import {
  buildDeck,
  buildFactionDeck,
  buildNeutralDeck,
  drawActionHand,
  drawFactionCardsForPair,
  getDesignated,
  pairKeyOf,
} from '@/utils/game/deck'
import { canAfford } from '@/utils/game/cost'
import { makePlayer } from '@/utils/game/player'
import { canAlly, FACTION_MAP } from '@/mocks/factions'
import { FACTION_DESIGNATED } from '@/mocks'
import { applyStoryEvent, describeStoryEvent, pickStoryEvent } from '@/utils/game/story'
import { pickPactEvent } from '@/utils/game/pact'
import { drawNeutralPoints } from '@/mocks/neutral'
import { describeReward, resolveBids, validateBid } from '@/utils/game/bid'
import type {
  Bid,
  BidResult,
  CardDef,
  FactionId,
  LogEntry,
  NeutralPointDef,
  PactEventDef,
  Pick,
  PlayerState,
  StoryEventDef,
} from '@/types'
import type {
  DesignatedAction,
  MatchView,
  PublicPlayer,
  RoomPhase,
  RoomView,
  SeatView,
  SelfView,
  Snapshot,
} from '@/shared/protocol'
import { MAX_ROUND, ROOM_CAPACITY } from '@/shared/protocol'

/** 引擎里的玩家：在 PlayerState 之上叠加「房间 / 流程」状态 */
export interface EnginePlayer extends PlayerState {
  /** 大厅准备 */
  ready: boolean
  /** 是否为房主 */
  isHost: boolean
  /** 简报页是否已确认看过自己的目标 */
  briefingAck: boolean
  /** 盟约窗口是否已就绪 */
  councilReady: boolean
  /** 结算页是否已点「进入下一回合」 */
  readyNext: boolean
}

/** 盟约窗口里一条待回应的结盟提议 */
export interface AllyRequest {
  fromId: string
  toId: string
}

export interface EngineState {
  roomId: string
  phase: RoomPhase
  round: number
  players: EnginePlayer[]
  /** 按玩家分开的手牌（联机暗选的核心） */
  hands: Record<string, CardDef[]>
  /** 已提交的选牌（仅服务端可全见） */
  picks: Record<string, Pick>
  deck: Record<string, CardDef[]>
  discard: Record<string, CardDef[]>
  neutralDeck: CardDef[]
  neutralDiscard: CardDef[]
  factionCardDeck: CardDef[]
  factionCardDiscard: CardDef[]
  /** 按同盟对分开的交换牌候选：pairKey → 2 张 */
  factionOffers: Record<string, CardDef[]>
  /** 已拍板的交换：pairKey → 选中的牌 */
  factionPending: Record<string, CardDef>
  /** 已拍板的同盟对（含「这回合不谈」） */
  factionDecided: Record<string, boolean>
  /** 本回合公开的盟约事件 */
  pactEvent: PactEventDef | null
  /**
   * 本回合抽到的剧情事件（对全场生效）。
   * 每局每个回合都从该回合的 3 个候选里随机抽 1 个，见 src/mocks/story.ts。
   */
  storyEvent: StoryEventDef | null
  /** 已经发生过的剧情事件（按回合顺序），用于时间轴回看 */
  storyHistory: { round: number; label: string }[]
  /** 本回合刷出的中立资源点（竞标争夺） */
  neutralPoints: NeutralPointDef[]
  /** 本回合各玩家对资源点的出价：playerId → { pointId, amount } */
  bids: Record<string, Bid>
  /** 上一回合的竞标结果（结算后公开，供界面复盘） */
  bidResults: BidResult[]
  /** 盟约窗口的待回应提议 */
  allyRequests: AllyRequest[]
  log: LogEntry[]
  roundLog: LogEntry[]
  winner: FactionId | null
  winnerReason: string
  createdAt: number
  /**
   * 当前阶段的截止时间戳（毫秒）；null 表示本阶段不计时。
   * 引擎是纯函数，只负责把「阶段何时结束」记录下来；
   * 真正到点触发是服务端的定时器做的（见 server/timers）。
   */
  deadline: number | null
  /** 当前阶段总时长（毫秒）；null 表示不计时。用于客户端画进度条 */
  duration: number | null
}

export type EngineResult = { state: EngineState; error?: string }

export interface EngineOptions {
  /** 注入随机源，测试时可固定 */
  random?: () => number
}

/**
 * 各阶段的决策时限（毫秒）。
 *
 * 为什么这些阶段要计时
 * - 联机版没有「催一下」的物理手段，有人去接水整桌就干等；
 * - 超时后由服务端自动执行「最保守的默认操作」，所以不会卡死。
 *
 * 为什么大厅/终局不计时
 * - 大厅是等人加入，计时没有意义；
 * - 终局已经结束，没有需要推进的东西。
 *
 * 结算页**必须**计时：它虽然只是看战报 + 拍板交换牌，但只要有一个人不点
 * 「准备下一回合」，整局就永远停在那里。这是最容易踩的卡死点。
 * 给 60 秒是因为要看战报、还要和盟友谈交换牌，比暗选更需要时间。
 *
 * 数值选择：暗选 30 秒（玩家要求）；盟约 45 秒（要协商）；结算 60 秒（要读战报）。
 */
export const PHASE_DURATION: {
  briefing: number
  picking: number
  council: number
  resolved: number
} = {
  briefing: 60_000,
  picking: 30_000,
  council: 45_000,
  resolved: 60_000,
}

/**
 * 时限的运行时覆盖值。
 *
 * 生产环境永远是 PHASE_DURATION 里的值；只有服务端在启动时显式调用
 * `overrideDurations()` 才会改（测试用极短的时限跑完整个超时流程，
 * 否则验证一次「30 秒不操作会自动推进」要真的等 30 秒）。
 *
 * 放在模块级而不是塞进 EngineState：时限是部署配置，不属于对局状态，
 * 也不该随快照在网络上传来传去（否则客户端能改自己的倒计时）。
 */
let durationOverride: {
  briefing?: number
  picking?: number
  council?: number
  resolved?: number
} | null = null

/** 仅服务端/测试使用：覆盖各阶段时限。传 null 恢复默认 */
export function overrideDurations(
  next: {
    briefing?: number
    picking?: number
    council?: number
    resolved?: number
  } | null,
): void {
  durationOverride = next
}

/** 取某阶段的时限；没有配时限的阶段返回 null */
export function durationOfPhase(phase: RoomPhase): number | null {
  if (
    phase !== 'briefing' &&
    phase !== 'picking' &&
    phase !== 'council' &&
    phase !== 'resolved'
  ) {
    return null
  }
  const overridden = durationOverride?.[phase]
  if (typeof overridden === 'number' && overridden > 0) return overridden
  return PHASE_DURATION[phase]
}

/**
 * 给状态打上当前阶段的截止时间。
 * 所有「进入新阶段」的地方都必须调它，否则客户端会显示上一阶段的倒计时。
 */
function stampDeadline(state: EngineState, now: number = Date.now()): EngineState {
  const duration = durationOfPhase(state.phase)
  if (duration === null) return { ...state, deadline: null, duration: null }
  return { ...state, deadline: now + duration, duration }
}

/** 模块级随机源：默认 Math.random，测试/回放可经 startMatch 的 opts.random 覆盖。
 *  覆盖后本局后续所有随机（发牌、剧情、竞标点、盟约事件、掷骰）都走它，
 *  这样才能复现某一局。 */
let engineRandom: () => number = Math.random

/** 默认随机源（历史引用保留，指向模块级随机源） */
const defaultRandom = () => engineRandom()

/**
 * 每回合刷出几个中立资源点。
 *
 * 2 个而不是 1 个：只有一个点时全场都在抢同一样东西，出价会迅速收敛到
 * 「有需要的那个人出满」，博弈退化成明牌比钱。两个点让玩家可以根据
 * 自己的短板选不同目标，出现「你抢补给、我抢士气」的分流。
 * 也不要 3 个以上：点太多就不紧张了，而且四人都能分到就失去争夺意义。
 */
const NEUTRAL_POINT_COUNT = 2

/** 生成本局需要的全部牌堆 */
function buildAllDecks(playerIds: string[], factionIds: Record<string, PlayerState['factionId']>): {
  deck: Record<string, CardDef[]>
  discard: Record<string, CardDef[]>
} {
  const deck: Record<string, CardDef[]> = {}
  const discard: Record<string, CardDef[]> = {}
  playerIds.forEach((id) => {
    // buildDeck 内部已洗牌；传 random 让洗牌可注入，去掉外层重复 shuffle
    deck[id] = buildDeck(factionIds[id], defaultRandom)
    discard[id] = []
  })
  return { deck, discard }
}

/* ------------------------------------------------------------------ *
 * 房间生命周期
 * ------------------------------------------------------------------ */

/** 新建一个空房间（房主尚未入座） */
export function createEngine(roomId: string): EngineState {
  return {
    roomId,
    phase: 'lobby',
    round: 1,
    players: [],
    hands: {},
    picks: {},
    deck: {},
    discard: {},
    neutralDeck: [],
    neutralDiscard: [],
    factionCardDeck: [],
    factionCardDiscard: [],
    factionOffers: {},
    factionPending: {},
    factionDecided: {},
    pactEvent: null,
    storyEvent: null,
    storyHistory: [],
    neutralPoints: [],
    bids: {},
    bidResults: [],
    allyRequests: [],
    log: [],
    roundLog: [],
    winner: null,
    winnerReason: '',
    createdAt: Date.now(),
    // 大厅阶段不计时，等四人齐了开局才启动第一个倒计时
    deadline: null,
    duration: null,
  }
}

/**
 * 分配一个「当前未被占用」的玩家 id。
 * 实现是「取最小未用 id」（p1..p64 里第一个不在已用集合中的），而不是单调计数——
 * 大厅里有人离开后，最小未用 id 可能被复用，但只要不在当前玩家集合里就是安全的：
 * 离开者的 token 已随座位一起移除，不会再认领到新玩家头上。
 */
function allocatePlayerId(state: EngineState): string {
  const used = new Set(state.players.map((p) => p.id))
  for (let i = 1; i <= 64; i += 1) {
    const id = `p${i}`
    if (!used.has(id)) return id
  }
  throw new Error('玩家 id 耗尽')
}

/** 加入房间。token 重连由调用方（server 的 Room）负责匹配，这里只处理座位。 */
export function joinAsPlayer(state: EngineState, name: string): { state: EngineState; playerId: string } | { error: string } {
  if (state.phase !== 'lobby') return { error: '对局已开始，无法中途加入。' }
  if (state.players.length >= ROOM_CAPACITY) return { error: '房间已满（4/4）。' }
  const clean = name.trim().slice(0, 12) || `玩家${state.players.length + 1}`
  const playerId = allocatePlayerId(state)
  const isHost = state.players.length === 0
  const player: EnginePlayer = {
    ...makePlayer(clean, 'SARK', state.players.length),
    id: playerId,
    name: clean,
    ready: false,
    isHost,
    briefingAck: false,
    councilReady: false,
    readyNext: false,
  }
  return {
    state: { ...state, players: [...state.players, player] },
    playerId,
  }
}

/**
 * 释放座位（离开房间）。
 * 不改动其他人的 id —— 座位号只是展示顺序，id 是身份凭证。
 * 房主离开时把房主顺延给仍在房间里的第一位。
 */
export function leaveAsPlayer(state: EngineState, playerId: string): EngineState {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) return state
  // 对局已经开始时不允许离座，避免中途 3 人残局（重连是另一条路径）
  if (state.phase !== 'lobby') return state
  const rest = state.players.filter((p) => p.id !== playerId)
  const wasHost = player.isHost
  return {
    ...state,
    players: rest.map((p, i) => ({
      ...p,
      isHost: wasHost ? i === 0 : p.isHost,
    })),
  }
}

/** 大厅准备状态 */
export function setReady(state: EngineState, playerId: string, ready: boolean): EngineResult {
  if (state.phase !== 'lobby') return { state, error: '对局已开始，无法修改准备状态。' }
  if (!state.players.some((p) => p.id === playerId)) return { state, error: '玩家不存在。' }
  return {
    state: {
      ...state,
      players: state.players.map((p) => (p.id === playerId ? { ...p, ready } : p)),
    },
  }
}

/** 四人到齐且全部准备 → 允许开局 */
export function canStart(state: EngineState): boolean {
  return (
    state.phase === 'lobby' &&
    state.players.length === ROOM_CAPACITY &&
    state.players.every((p) => p.ready)
  )
}

/**
 * 开局：分配阵营、建牌堆、进入战前简报。
 * 座位顺序保留，阵营随机（含至少一对敌对）。
 */
export function startMatch(state: EngineState, opts: EngineOptions = {}): EngineResult {
  if (!canStart(state)) return { state, error: '需要 4 名玩家全部准备后才能开始。' }
  // 覆盖模块级随机源：本局后续所有随机都走它，实现可复现。
  if (opts.random) engineRandom = opts.random
  const random = defaultRandom
  const factions = assignFactions(random)
  // 座位顺序保留，但 id 必须原样继承：服务端的 Seat 是按 playerId 匹配 token 的，
  // 这里若重写成 p1..p4，大厅里有人离开过（id 出现空洞）就会让 token 对不上座位，
  // 玩家在简报/对局阶段一刷新就回不到原位。
  const players: EnginePlayer[] = state.players.map((p, i) => ({
    ...makePlayer(p.name, factions[i], i),
    id: p.id,
    name: p.name,
    ready: true,
    isHost: p.isHost,
    briefingAck: false,
    councilReady: false,
    readyNext: false,
  }))
  const factionIds: Record<string, PlayerState['factionId']> = {}
  players.forEach((p) => {
    factionIds[p.id] = p.factionId
  })
  const { deck, discard } = buildAllDecks(
    players.map((p) => p.id),
    factionIds,
  )
  const next: EngineState = {
    ...state,
    phase: 'briefing',
    round: 1,
    players,
    hands: {},
    picks: {},
    deck,
    discard,
    neutralDeck: buildNeutralDeck(random),
    neutralDiscard: [],
    factionCardDeck: buildFactionDeck(random),
    factionCardDiscard: [],
    factionOffers: {},
    factionPending: {},
    factionDecided: {},
    pactEvent: null,
    storyEvent: null,
    storyHistory: [],
    neutralPoints: [],
    bids: {},
    bidResults: [],
    allyRequests: [],
    log: [],
    roundLog: [],
    winner: null,
    winnerReason: '',
    createdAt: Date.now(),
    deadline: null,
    duration: null,
  }
  // 开局进入「战前简报」，开始第一个倒计时
  return { state: stampDeadline(next) }
}

/** 简报页：某人确认看过自己的目标 */
export function briefingAck(state: EngineState, playerId: string): EngineResult {
  if (state.phase !== 'briefing') return { state, error: '当前不在战前简报阶段。' }
  if (!state.players.some((p) => p.id === playerId)) return { state, error: '玩家不存在。' }
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, briefingAck: true } : p,
  )
  const allAck = players.every((p) => p.briefingAck)
  if (!allAck) return { state: { ...state, players } }
  // 四人都确认 → 开始第 1 回合
  return startRound({ ...state, players }, 1)
}

/* ------------------------------------------------------------------ *
 * 回合流程
 * ------------------------------------------------------------------ */

/** 给一位玩家发一手牌（3 张本阵营行动牌 + 1 张中立 + 1 张指定牌） */
function dealHand(
  state: EngineState,
  player: PlayerState,
): {
  hand: CardDef[]
  deck: Record<string, CardDef[]>
  discard: Record<string, CardDef[]>
  neutralDeck: CardDef[]
  neutralDiscard: CardDef[]
} {
  const drawn = drawActionHand(
    state.deck[player.id] ?? [],
    state.discard[player.id] ?? [],
    state.neutralDeck,
    state.neutralDiscard,
    (card) => canAfford(card, player.stats),
  )
  const designated = getDesignated(player.factionId, state.round, FACTION_DESIGNATED[player.factionId])
  return {
    hand: designated ? [...drawn.hand, designated] : drawn.hand,
    deck: { ...state.deck, [player.id]: drawn.factionDeck },
    discard: { ...state.discard, [player.id]: drawn.factionDiscard },
    neutralDeck: drawn.neutralDeck,
    neutralDiscard: drawn.neutralDiscard,
  }
}

/**
 * 开始某一回合：先结算上回合拍板的阵营交换，再套本回合随机抽到的剧情事件，
 * 掷盟约事件、刷中立资源点，然后给所有在场玩家发牌，进入并行暗选。
 */
export function startRound(state: EngineState, round: number): EngineResult {
  const faction = applyFactionCards(state.players as PlayerState[], state.factionPending)
  // 剧情事件：每局每回合从 3 个候选里随机抽 1 个（不再是固定剧本）
  const storyEvent = pickStoryEvent(round, defaultRandom)
  const players = clampToCap(
    applyStoryEvent(faction.players, storyEvent),
  ).map((p) => {
    const e = p as EnginePlayer
    return { ...e, betrayedThisRound: false, councilReady: false, readyNext: false } as EnginePlayer
  }) as EnginePlayer[]

  // 阵营牌／剧情可能把资源压到 ≤0，这里同步判一次崩溃/流亡/出局，
  // 避免玩家带着负资源参加整回合暗选。日志并入本回合 roundLog。
  const collapseLogs: LogEntry[] = []
  applyCollapse(players as PlayerState[], round, collapseLogs)

  // 盟约事件不在这里抽：结盟/撕约发生在盟约窗口（council）阶段，
  // 「场上是否有盟约」要等到结算前那一刻才确定，所以改在 doResolve 判定。
  // 这里只把上一回合的 pactEvent 清空，避免暗选阶段看到过期的事件。
  const pactEvent = null
  // 中立资源点：每回合刷 2 个，四人竞标争夺（最高价独得，其余人的出价打水漂）
  const neutralPoints = drawNeutralPoints(round, NEUTRAL_POINT_COUNT, defaultRandom)
  let next: EngineState = {
    ...state,
    round,
    players,
    pactEvent,
    storyEvent,
    storyHistory: storyEvent
      ? [...state.storyHistory, { round, label: storyEvent.label }]
      : state.storyHistory,
    neutralPoints,
    bids: {},
    bidResults: [],
    picks: {},
    hands: {},
    allyRequests: [],
    factionOffers: {},
    factionDecided: {},
    // 上回合已拍板的交换牌进弃牌堆
    factionCardDiscard: [...state.factionCardDiscard, ...Object.values(state.factionPending)],
    factionPending: {},
    phase: 'picking',
    log: [...state.log, ...state.roundLog],
    roundLog: [
      ...faction.logs.map((l) => ({ ...l, round })),
      { round, tone: 'info' as const, text: `第 ${round} 回合开始。` },
      ...collapseLogs.map((l) => ({ ...l, round })),
      ...(storyEvent
        ? [
            {
              round,
              tone: 'pact' as const,
              text: `本回合剧情【${storyEvent.label}】：${storyEvent.story}（${describeStoryEvent(storyEvent)}）`,
            },
          ]
        : []),
      ...(neutralPoints.length > 0
        ? [
            {
              round,
              tone: 'info' as const,
              text: `本回合中立资源：${neutralPoints.map((p) => `${p.name}（${describeReward(p.reward)}，最低出价 ${p.minBid}）`).join('；')}。出价最高者独得，其余人的出价不予退还。`,
            },
          ]
        : []),
    ],
  }

  // 全员发牌
  for (const player of players) {
    if (player.defeated) continue
    const dealt = dealHand(next, player)
    next = {
      ...next,
      hands: { ...next.hands, [player.id]: dealt.hand },
      deck: dealt.deck,
      discard: dealt.discard,
      neutralDeck: dealt.neutralDeck,
      neutralDiscard: dealt.neutralDiscard,
    }
  }
  // 进入暗选阶段：开始 30 秒决策倒计时
  return { state: stampDeadline(next) }
}

/** 从手牌里按 id 取牌（按实例核销，允许同 id 多张） */
function takeFromHand(hand: CardDef[], ids: string[]): { taken: CardDef[]; rest: CardDef[]; missing: string[] } {
  const rest = [...hand]
  const taken: CardDef[] = []
  const missing: string[] = []
  ids.forEach((id) => {
    const idx = rest.findIndex((c) => c.id === id)
    if (idx < 0) {
      missing.push(id)
      return
    }
    taken.push(rest[idx])
    rest.splice(idx, 1)
  })
  return { taken, rest, missing }
}

/** 未使用的手牌按类别退回牌堆 */
function refundCards(state: EngineState, playerId: string, cards: CardDef[]): {
  discard: Record<string, CardDef[]>
  neutralDiscard: CardDef[]
} {
  const discard = { ...state.discard }
  let neutralDiscard = [...state.neutralDiscard]
  const back: CardDef[] = []
  cards.forEach((c) => {
    // 指定牌是静态卡，直接丢弃
    if (c.category === 'designated') return
    if (c.owner === 'GENERIC') {
      neutralDiscard = [...neutralDiscard, c]
      return
    }
    back.push(c)
  })
  discard[playerId] = [...(discard[playerId] ?? []), ...back]
  return { discard, neutralDiscard }
}

/**
 * 提交本回合选牌。
 *
 * 校验全部在服务端做：手牌归属、行动牌数量、代价是否付得起（允许透支但要求客户端知情）、
 * 指定牌处置是否与手牌一致、目标是否合法。任何一项不符都整单拒绝，不做部分应用。
 */
export function submitPick(
  state: EngineState,
  playerId: string,
  input: {
    actionCardIds: string[]
    neutralAccept: boolean
    designated: { play: 'held' | 'new' | null; keep: 'held' | 'new' | null }
    targetId?: string | null
    /**
     * 对中立资源点的秘密出价。
     * 省略等价于「不参与争夺」；传了就按 validateBid 校验。
     */
    bid?: { pointId: string | null; amount: number } | null
  },
): EngineResult {
  if (state.phase !== 'picking') return { state, error: '当前不在暗选阶段。' }
  const player = state.players.find((p) => p.id === playerId)
  if (!player) return { state, error: '玩家不存在。' }
  if (player.defeated) return { state, error: '你已出局。' }
  if (state.picks[playerId]) return { state, error: '本回合你已经提交过了。' }

  const hand = state.hands[playerId] ?? []
  const actionCards = hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC')
  const neutralCard = hand.find((c) => c.category === 'action' && c.owner === 'GENERIC') ?? null
  const offered = hand.find((c) => c.category === 'designated') ?? null
  const held = player.heldDesignated

  // 1. 行动牌必须恰好 2 张，且都在自己的手牌里
  if (input.actionCardIds.length !== 2) return { state, error: '必须选择 2 张行动牌。' }
  const uniqueIds = new Set(input.actionCardIds)
  if (uniqueIds.size !== 2) return { state, error: '不能重复选择同一张牌。' }
  const picked = actionCards.filter((c) => uniqueIds.has(c.id))
  if (picked.length !== 2) return { state, error: '所选的牌不在你的手牌中。' }

  // 2. 中立援助
  const playNeutral = Boolean(neutralCard && input.neutralAccept)
  if (input.neutralAccept && !neutralCard) return { state, error: '本回合没有中立援助可接受。' }

  // 2.5 中立资源竞标：出价合法性优先于其它逻辑，脏出价整单拒绝
  const bidInput = input.bid ?? null
  const bidError = validateBid(state.neutralPoints, bidInput)
  if (bidError) return { state, error: bidError }
  // 出价 0 或未选点 = 不参与：不写入 bids 表，否则会污染「已出价人数」（bidCount）
  const bid: Bid | null =
    bidInput && bidInput.pointId && bidInput.amount > 0
      ? { pointId: bidInput.pointId, amount: bidInput.amount }
      : null

  // 3. 指定牌处置：合法性完全由手牌决定，客户端不能凭空捏造
  const hasHeld = Boolean(held)
  const hasOffered = Boolean(offered)
  const wantsPlayHeld = input.designated.play === 'held'
  const wantsPlayNew = input.designated.play === 'new'
  const wantsKeepHeld = input.designated.keep === 'held'
  const wantsKeepNew = input.designated.keep === 'new'

  if (wantsPlayHeld && !hasHeld) return { state, error: '没有可打出的保留牌。' }
  if (wantsPlayNew && !hasOffered) return { state, error: '没有可打出的新指定牌。' }
  if (wantsKeepHeld && !hasHeld) return { state, error: '没有可保留的旧指定牌。' }
  if (wantsKeepNew && !hasOffered) return { state, error: '没有可保留的新指定牌。' }
  if (input.designated.play && input.designated.keep) {
    return { state, error: '不能同时打出和保留同一张指定牌。' }
  }
  // 流亡者不能主动针对他人：打出的指定牌不生效，因此直接禁止打出来，只能保留
  if (wantsPlayHeld || wantsPlayNew) {
    if (player.exiled) return { state, error: '你处于流亡状态，不能打出指定牌。' }
  }

  let playedDesignated: CardDef | null = null
  let keptDesignated: CardDef | null = null
  if (wantsPlayHeld) {
    playedDesignated = held
    // 打旧牌时，新发的牌可以留着
    keptDesignated = input.designated.keep === 'new' ? offered : null
  } else if (wantsPlayNew) {
    playedDesignated = offered
    keptDesignated = input.designated.keep === 'held' ? held : null
  } else if (wantsKeepHeld) {
    keptDesignated = held
  } else if (wantsKeepNew) {
    keptDesignated = offered
  }

  /* ---- 指定牌「只能保留一回合」的限制 ----
   * 规则见 docs/00-澄清记录.md 第 6 条：指定牌保留上限 1 张，且只能保留一回合；
   * 流亡期间是唯一例外（可跨回合继续留同一张）。
   *
   * 这里的判定放在「已经算出 keptDesignated」之后，因为要区分两种情况：
   *   - 玩家这回合把旧牌继续留着（wantsKeepHeld）→ 违反一回合限制，拒绝
   *   - 玩家打出旧牌、留新牌（keep='new'）→ 合法，且重新开始计一回合
   * 流亡者整段跳过，规则允许他无限期留。 */
  if (!player.exiled && keptDesignated && held && keptDesignated.id === held.id) {
    const keptFrom = player.heldKeptRound
    if (keptFrom !== null && state.round > keptFrom) {
      return {
        state,
        error: '指定牌只能保留一回合：这张上回合已保留过，请打出或弃置。',
      }
    }
  }

  // 4. 目标合法性：指定牌统一可指向任意其他未出局玩家
  let targetId: string | null = null
  if (playedDesignated) {
    const target = state.players.find((p) => p.id === input.targetId && p.id !== playerId && !p.defeated)
    if (!target) return { state, error: '请选择一位合法的目标玩家。' }
    targetId = target.id
  }

  // 5. 组牌并核销手牌
  const cards = [...picked, ...(playNeutral && neutralCard ? [neutralCard] : [])]
  const consumedIds = [...picked.map((c) => c.id), ...(playNeutral && neutralCard ? [neutralCard.id] : [])]
  const { rest } = takeFromHand(hand, consumedIds)
  // 剩下的牌（含未打出的指定牌）退回牌堆
  const refunded = refundCards(state, playerId, rest)

  const pick: Pick = {
    cards,
    designated: playedDesignated,
    kept: keptDesignated,
    targetId,
  }

  const players = state.players.map((p) => {
    if (p.id !== playerId) return p
    // 记录保留起始回合：同一张牌继续留则沿用旧值，换了牌则从本轮重新计
    const keptRound = keptDesignated
      ? keptDesignated.id === p.heldDesignated?.id && p.heldKeptRound !== null
        ? p.heldKeptRound
        : state.round
      : null
    return { ...p, heldDesignated: keptDesignated, heldKeptRound: keptRound }
  })

  let next: EngineState = {
    ...state,
    players,
    picks: { ...state.picks, [playerId]: pick },
    hands: { ...state.hands, [playerId]: [] },
    discard: refunded.discard,
    neutralDiscard: refunded.neutralDiscard,
    // 出价写进 bids 表：过程中不广播给其他人（快照会按视角脱敏）
    bids: bid ? { ...state.bids, [playerId]: bid } : state.bids,
  }

  // 6. 全员提交 → 盟约窗口
  const activePlayers = next.players.filter((p) => !p.defeated)
  const allSubmitted = activePlayers.every((p) => next.picks[p.id])
  if (allSubmitted) {
    // 进入盟约窗口：重新开始计时（暗选的剩余时间不带过来）
    next = stampDeadline({ ...next, phase: 'council', allyRequests: [] })
  }
  return { state: next }
}

/* ------------------------------------------------------------------ *
 * 盟约窗口
 * ------------------------------------------------------------------ */

export function councilAllyRequest(state: EngineState, playerId: string, targetId: string): EngineResult {
  if (state.phase !== 'council') return { state, error: '当前不在盟约阶段。' }
  const me = state.players.find((p) => p.id === playerId)
  const target = state.players.find((p) => p.id === targetId)
  if (!me || !target) return { state, error: '玩家不存在。' }
  if (me.id === target.id) return { state, error: '不能与自己结盟。' }
  // 出局/流亡者不能参与结盟：出局者无行动能力，流亡者已丧失主动社交资格。
  // UI 隐藏了按钮，但协议层必须再拦一道，否则恶意客户端可绕过界面强行结盟。
  if (me.defeated || me.exiled) return { state, error: '你已出局或流亡，无法结盟。' }
  if (target.defeated || target.exiled) return { state, error: '对方已出局或流亡，无法结盟。' }
  if (me.allyId || me.betrayed) return { state, error: '你当前无法发起结盟。' }
  if (target.allyId || target.betrayed) return { state, error: '对方当前无法结盟。' }
  if (!canAlly(me.factionId, target.factionId)) return { state, error: '这两个阵营不能结盟。' }
  const pairs = state.players.filter((p) => p.allyId).length / 2
  if (pairs >= 2) return { state, error: '同盟已达上限（2 对）。' }
  // 同样的请求不重复入队
  if (state.allyRequests.some((r) => r.fromId === playerId && r.toId === targetId)) return { state }
  return {
    state: {
      ...state,
      allyRequests: [...state.allyRequests, { fromId: playerId, toId: targetId }],
    },
  }
}

export function councilAllyRespond(
  state: EngineState,
  playerId: string,
  fromId: string,
  accept: boolean,
): EngineResult {
  if (state.phase !== 'council') return { state, error: '当前不在盟约阶段。' }
  const request = state.allyRequests.find((r) => r.fromId === fromId && r.toId === playerId)
  if (!request) return { state, error: '没有找到这条结盟请求。' }
  // 只清掉「当前处理这条」；结盟成功后还会再清反向请求（见下方）
  const remaining = state.allyRequests.filter((r) => !(r.fromId === fromId && r.toId === playerId))
  if (!accept) return { state: { ...state, allyRequests: remaining } }

  const players = createAlliance(state.players, fromId, playerId)
  if (!players) {
    return { state: { ...state, allyRequests: remaining }, error: '当前无法结盟（资格或上限不符）。' }
  }
  // 结盟成功：这两人之间若还挂着反向请求（互发后一方同意），必须一并清掉，
  // 否则发起方会一直看到一个「来自已成盟友的人」的 incoming 残留。
  const cleared = remaining.filter(
    (r) => !(r.fromId === playerId && r.toId === fromId),
  )
  const a = state.players.find((p) => p.id === fromId)!
  const b = state.players.find((p) => p.id === playerId)!
  const log: LogEntry = {
    round: state.round,
    tone: 'good',
    text: `${a.name}（${FACTION_MAP[a.factionId].name}）与 ${b.name}（${FACTION_MAP[b.factionId].name}）结盟。`,
  }
  return {
    state: {
      ...state,
      players: players as EnginePlayer[],
      allyRequests: cleared,
      roundLog: [...state.roundLog, log],
    },
  }
}

export function councilBreakAlly(state: EngineState, playerId: string): EngineResult {
  if (state.phase !== 'council') return { state, error: '当前不在盟约阶段。' }
  const result = dissolveAlliance(state.players, playerId)
  if (!result) return { state, error: '你当前没有可撕毁的盟约。' }
  const a = state.players.find((p) => p.id === playerId)!
  const log: LogEntry = {
    round: state.round,
    tone: 'bad',
    text: `${a.name} 撕毁盟约，永久失去结盟资格；同盟的互援与同盟类加成自本回合起立即失效，只有背刺加成照常结算。`,
  }
  return {
    state: {
      ...state,
      players: result.players as EnginePlayer[],
      roundLog: [...state.roundLog, log],
    },
  }
}

/** 单人点击「盟约窗口我已就绪」；未出局者全部就绪后进入结算 */
export function councilReady(state: EngineState, playerId: string): EngineResult {
  if (state.phase !== 'council') return { state, error: '当前不在盟约阶段。' }
  const me = state.players.find((p) => p.id === playerId)
  if (!me) return { state, error: '玩家不存在。' }

  const players = state.players.map((p) => (p.id === playerId ? { ...p, councilReady: true } : p))
  const active = players.filter((p) => !p.defeated)

  // 全员出局是极端边界：此时没人能点「就绪」，不主动推进就会永远卡在盟约阶段。
  // 300 局压测里从未出现（最多 1 人出局），但卡死比推进更糟，直接结算。
  if (active.length === 0) {
    return doResolve({ ...state, players, allyRequests: [] })
  }
  if (me.defeated) return { state, error: '你已出局，无需点击就绪。' }

  const allReady = active.every((p) => p.councilReady)
  if (!allReady) return { state: { ...state, players } }
  return doResolve({ ...state, players, allyRequests: [] })
}

/* ------------------------------------------------------------------ *
 * 结算
 * ------------------------------------------------------------------ */

function doResolve(state: EngineState): EngineResult {
  if (state.phase !== 'council') return { state, error: '当前不在结算阶段。' }

  /* ---- 先结算中立资源竞标 ----
   * 放在 resolveRound 之前是有讲究的：竞标扣的是补给，
   * 如果放到结算之后，透支出价造成的崩溃就永远轮不到第 8 步的
   * 「崩溃/流亡」判定，玩家可以带着负补给活到下一回合。
   * 放在前面还顺带保证了日志是按时间顺序的：抢点 → 打牌 → 盟约。 */
  const bidOutcome = resolveBids(
    state.players as PlayerState[],
    state.neutralPoints,
    state.bids,
    state.round,
  )
  const bidLogs: LogEntry[] = bidOutcome.logs.map((text) => ({
    round: state.round,
    tone: 'pact' as const,
    text,
  }))

  // 盟约事件（v0.4.2）：用结算前的盟约关系判定「场上是否有盟约」，
  // 无盟约不触发；有盟约 50% 概率触发；触发后三类走向随机选一。
  // 竞标只动补给、不改 allyId，所以这里用 bidOutcome.players 的盟约关系是正确的。
  const pactEvent = pickPactEvent(bidOutcome.players, defaultRandom)

  const result = resolveRound(
    bidOutcome.players,
    state.picks,
    state.round,
    pactEvent,
    defaultRandom,
  )
  const victory = judgeVictory(result.players, state.round)

  // 本回合打出/未用的牌按类别归堆
  const discard = { ...state.discard }
  let neutralDiscard = [...state.neutralDiscard]
  state.players.forEach((p) => {
    const cards = state.picks[p.id]?.cards ?? []
    neutralDiscard.push(...cards.filter((c) => c.category === 'action' && c.owner === 'GENERIC'))
    discard[p.id] = [
      ...(discard[p.id] ?? []),
      ...cards.filter((c) => c.category === 'action' && c.owner !== 'GENERIC'),
    ]
  })

  // 每对同盟发 2 张交换牌候选（第 7 回合起不再发放）
  const factionOffers: Record<string, CardDef[]> = {}
  let factionCardDeck = [...state.factionCardDeck]
  let factionCardDiscard = [...state.factionCardDiscard]
  if (!victory && state.round < MAX_ROUND) {
    const seen = new Set<string>()
    result.players.forEach((p) => {
      if (p.defeated || p.exiled || !p.allyId) return
      const partner = result.players.find((o) => o.id === p.allyId)
      if (!partner || partner.defeated || partner.exiled) return
      const key = pairKeyOf([p.factionId, partner.factionId])
      if (seen.has(key)) return
      seen.add(key)
      const drawn = drawFactionCardsForPair(factionCardDeck, factionCardDiscard, key, 2)
      factionCardDeck = drawn.deck
      factionCardDiscard = drawn.discard
      if (drawn.cards.length > 0) factionOffers[key] = drawn.cards
    })
  }

  const next: EngineState = {
    ...state,
    players: result.players as EnginePlayer[],
    discard,
    neutralDiscard,
    factionCardDeck,
    factionCardDiscard,
    factionOffers,
    factionPending: {},
    factionDecided: {},
    phase: 'resolved',
    // 盟约事件：结算前判定，结算后仍保留给界面与日志复盘
    pactEvent,
    // 竞标结果公开（过程中保密，结算后复盘用）
    bidResults: bidOutcome.results,
    bids: {},
    roundLog: [...state.roundLog, ...bidLogs, ...result.logs],
    winner: victory?.factionId ?? null,
    winnerReason: victory?.reason ?? '',
    allyRequests: [],
  }
  // 结算页也要计时：否则有人不点「准备下一回合」整局就永远卡住
  return { state: stampDeadline(next) }
}

/** 结算页：我的同盟对拍板交换牌。cardId=null 表示这回合不谈 */
export function factionPick(state: EngineState, playerId: string, cardId: string | null): EngineResult {
  if (state.phase !== 'resolved') return { state, error: '当前不在结算阶段。' }
  const player = state.players.find((p) => p.id === playerId)
  if (!player) return { state, error: '玩家不存在。' }
  const pairKey = pairKeyOf_forPlayer(state, playerId)
  if (!pairKey) return { state, error: '你当前没有可用的同盟交换。' }
  if (state.factionDecided[pairKey]) return { state, error: '这对同盟本回合已经拍板了。' }
  const offers = state.factionOffers[pairKey]
  if (!offers) return { state, error: '本回合没有交换牌。' }

  const factionPending = { ...state.factionPending }
  const factionCardDiscard = [...state.factionCardDiscard]
  if (cardId) {
    const chosen = offers.find((c) => c.id === cardId)
    if (!chosen) return { state, error: '所选交换牌不在候选中。' }
    factionPending[pairKey] = chosen
    factionCardDiscard.push(...offers.filter((c) => c.id !== cardId))
  } else {
    factionCardDiscard.push(...offers)
  }
  const factionOffers = { ...state.factionOffers }
  delete factionOffers[pairKey]

  return {
    state: {
      ...state,
      factionOffers,
      factionPending,
      factionCardDiscard,
      factionDecided: { ...state.factionDecided, [pairKey]: true },
    },
  }
}

/** 找到某位玩家所属同盟对的 pairKey；无同盟返回 null */
function pairKeyOf_forPlayer(state: EngineState, playerId: string): string | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || !player.allyId) return null
  const partner = state.players.find((p) => p.id === player.allyId)
  if (!partner) return null
  return pairKeyOf([player.factionId, partner.factionId])
}

/** 结算页：我已看完，准备下一回合 */
export function readyNext(state: EngineState, playerId: string): EngineResult {
  if (state.phase !== 'resolved') return { state, error: '当前不在结算阶段。' }
  const me = state.players.find((p) => p.id === playerId)
  if (!me) return { state, error: '玩家不存在。' }
  let working = state

  // 兜底：如果自己还有同盟对没拍板，点「进入下一回合」视为「这回合不谈」
  const pairKey = pairKeyOf_forPlayer(working, playerId)
  if (pairKey && !working.factionDecided[pairKey] && working.factionOffers[pairKey]) {
    const r = factionPick(working, playerId, null)
    if (!r.error) working = r.state
  }

  const players = working.players.map((p) => (p.id === playerId ? { ...p, readyNext: true } : p))
  const active = players.filter((p) => !p.defeated)
  // 全员出局的极端边界：没人能点「进入下一回合」，主动推进而不是卡在结算页
  const allReady = active.length === 0 || active.every((p) => p.readyNext)
  if (!allReady) return { state: { ...working, players } }

  // 全员就绪：还有没拍板的同盟对，统一按「不谈」处理
  let leftover = working
  const undecided = Object.keys(leftover.factionOffers)
  if (undecided.length > 0) {
    const fakePlayer = leftover.players.find(
      (p) => pairKeyOf_forPlayer(leftover, p.id) === undecided[0],
    )
    if (fakePlayer) {
      const r = factionPick(leftover, fakePlayer.id, null)
      if (!r.error) leftover = r.state
    }
  }

  const final = { ...leftover, players: leftover.players.map((p) => ({ ...p, readyNext: false })) }

  // 全员出局：没人能继续操作，也不会有胜利者，直接进终局而不是再开一轮空转
  const anyAlive = final.players.some((p) => !p.defeated)
  if (!anyAlive) {
    return {
      state: {
        ...final,
        phase: 'result',
        roundLog: [...final.roundLog, { round: final.round, tone: 'bad' as const, text: '所有阵营均已出局，伦蒂尼姆的账无人能结。' }],
        hands: {},
        picks: {},
        deadline: null,
        duration: null,
      },
    }
  }

  // 终局判定
  if (final.winner || final.round >= MAX_ROUND) {
    return {
      state: {
        ...final,
        phase: 'result',
        roundLog: final.roundLog,
        hands: {},
        picks: {},
        deadline: null,
        duration: null,
      },
    }
  }
  return startRound(final, final.round + 1)
}

/* ------------------------------------------------------------------ *
 * 视图生成（脱敏的核心）
 * ------------------------------------------------------------------ */

/** 把权威状态切成「某位玩家能看到的那一份」 */
export function viewFor(
  state: EngineState,
  viewerId: string | null,
  connectedIds: Set<string>,
): { room: RoomView; match: MatchView | null } {
  const seats: SeatView[] = state.players.map((p) => ({
    playerId: p.id,
    name: p.name,
    ready: p.ready,
    connected: connectedIds.has(p.id),
    isHost: p.isHost,
    briefingAck: p.briefingAck,
    submittedPick: Boolean(state.picks[p.id]),
    councilReady: p.councilReady,
    readyNext: p.readyNext,
  }))

  const room: RoomView = {
    roomId: state.roomId,
    phase: state.phase,
    capacity: ROOM_CAPACITY,
    hostPlayerId: state.players.find((p) => p.isHost)?.id ?? '',
    seats,
    createdAt: state.createdAt,
    allReady: canStart(state),
    onlineCount: seats.filter((s) => s.connected).length,
  }

  if (state.phase === 'lobby' || !viewerId) return { room, match: null }
  const self = state.players.find((p) => p.id === viewerId)
  if (!self) return { room, match: null }

  const players: PublicPlayer[] = state.players.map((p) => {
    // 保留的指定牌与保留起始回合都是私有信息，公开视图里直接摘掉
    const { heldDesignated: _held, heldKeptRound: _keptRound, ...pub } = p
    void _held
    void _keptRound
    return pub
  })

  const myPick = state.picks[viewerId] ?? null
  const selfView: SelfView = {
    ...self,
    hand: state.hands[viewerId] ?? [],
    victory: FACTION_MAP[self.factionId].victory,
    submitted: myPick,
  }

  // 盟约视图：只给我与我相关的提议
  const incomingReq = state.allyRequests.find((r) => r.toId === viewerId) ?? null
  const outgoingReq = state.allyRequests.find((r) => r.fromId === viewerId) ?? null
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? ''

  // 阵营交换视图：只有我这一对同盟能看到自己的候选
  const myPairKey = pairKeyOf_forPlayer(state, viewerId)
  const myOffers = myPairKey ? state.factionOffers[myPairKey] ?? [] : []
  const myPicked = myPairKey ? state.factionPending[myPairKey] ?? null : null
  const pendingPairs = Object.keys(state.factionOffers).length

  // 日志脱敏：大厅之前没有对局日志
  const match: MatchView = {
    round: state.round,
    maxRound: MAX_ROUND,
    phase: state.phase,
    players,
    self: selfView,
    pactEvent: state.pactEvent as never,
    storyEvent: state.storyEvent,
    storyHistory: state.storyHistory,
    neutralPoints: state.neutralPoints,
    // 只下发自己的出价；别人的出价在结算前是机密
    myBid: state.bids[viewerId] ?? null,
    bidCount: Object.keys(state.bids).length,
    bidResults: state.bidResults,
    log: state.log,
    roundLog: state.roundLog,
    winner: state.winner,
    winnerReason: state.winnerReason,
    council: {
      incoming: incomingReq
        ? { fromId: incomingReq.fromId, fromName: nameOf(incomingReq.fromId) }
        : null,
      outgoing: outgoingReq
        ? { toId: outgoingReq.toId, toName: nameOf(outgoingReq.toId) }
        : null,
      ready: self.councilReady,
      readyCount: state.players.filter((p) => p.councilReady).length,
    },
    faction: {
      offers: myOffers,
      canPick: Boolean(myPairKey && !state.factionDecided[myPairKey]),
      picked: myPicked,
      pendingPairs,
    },
    // 倒计时信息：只用于显示，客户端不据此做权威判断
    deadline: state.deadline,
    duration: state.duration,
  }

  return { room, match }
}

/**
 * 组装一条完整快照。
 *
 * `serverNow` 是刻意带上的：客户端用它校正本地时钟偏差。
 * 玩家把系统时间往前调，只会让本地时钟偏移估计变化，倒计时依然按服务端真实时间走。
 */
export function snapshotFor(
  state: EngineState,
  viewerId: string | null,
  connectedIds: Set<string>,
  seq: number,
  you: { playerId: string; token: string },
): Snapshot {
  const { room, match } = viewFor(state, viewerId, connectedIds)
  return { type: 'snapshot', seq, serverNow: Date.now(), room, match, you }
}

/* ------------------------------------------------------------------ *
 * 超时托管：把「还没动作的人」按保守默认值推过去
 * ------------------------------------------------------------------ */

/**
 * 为某个玩家生成「超时默认操作」并执行。
 *
 * 设计原则是「尽量不改变局势」：
 * - 暗选：从手牌里能打的两张行动牌自动打出，指定牌选择保留（不打人，避免误伤），
 *   中立援助只在付得起时接受。这样既不浪费回合，也不会替玩家做攻击决定。
 * - 简报：直接确认。
 * - 盟约：直接就绪（不主动结盟，也不撕毁，维持现状）。
 *
 * 返回值里的 `did` 用于服务端日志与测试断言，说明这次托管做了什么。
 */
export function autoActFor(
  state: EngineState,
  playerId: string,
): { state: EngineState; did: string; error?: string } {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) return { state, did: '', error: '玩家不存在。' }
  if (player.defeated) return { state, did: '' }

  /* ---- 简报：确认已读 ---- */
  if (state.phase === 'briefing') {
    if (player.briefingAck) return { state, did: '' }
    const r = briefingAck(state, playerId)
    return { state: r.state, did: r.error ? '' : 'briefingAck', error: r.error }
  }

  /* ---- 暗选：自动挑两张行动牌，指定牌保留 ---- */
  if (state.phase === 'picking') {
    if (state.picks[playerId]) return { state, did: '' }
    const hand = state.hands[playerId] ?? []
    const actions = hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC')
    if (actions.length < 2) return { state, did: '', error: '手牌不足，无法自动选牌。' }
    const offered = hand.find((c) => c.category === 'designated')
    const held = player.heldDesignated

    // 托管优先选「付得起」的牌，避免替 AFK 玩家强行透支；
    // 只有付得起的不足 2 张时，才用付不起的补足，保证阶段照常推进。
    const affordable = actions.filter((c) => canAfford(c, player.stats))
    const unaffordable = actions.filter((c) => !canAfford(c, player.stats))
    const chosenIds = [...affordable, ...unaffordable].slice(0, 2).map((c) => c.id)

    // 指定牌：默认「不打人」。
    // 但要先看这张旧牌还有没有保留额度——规则限定只能保留一回合，
    // 已经留过一轮的必须在本次打出或弃置，托管不能硬留（否则会被引擎拒绝）。
    let designated: DesignatedAction = { play: null, keep: null }
    if (held) {
      const keptFrom = player.heldKeptRound
      const mustRelease = !player.exiled && keptFrom !== null && state.round > keptFrom
      if (mustRelease) {
        // 额度过期：新发的就留新的，否则干脆弃置（都不打人）
        designated = offered ? { play: null, keep: 'new' } : { play: null, keep: null }
      } else {
        designated = { play: null, keep: 'held' }
      }
    } else if (offered) {
      designated = { play: null, keep: 'new' }
    }

    const r = submitPick(state, playerId, {
      actionCardIds: chosenIds,
      neutralAccept: false,
      designated,
      targetId: null,
    })
    return { state: r.state, did: r.error ? '' : 'submitPick', error: r.error }
  }

  /* ---- 盟约：直接就绪，不做任何人际操作 ---- */
  if (state.phase === 'council') {
    if (player.councilReady) return { state, did: '' }
    // 自己还有没拍板的交换牌就先按「不谈」处理，避免推进时被兜底逻辑卡住
    const pairKey = pairKeyOf_forPlayer(state, playerId)
    if (pairKey && !state.factionDecided[pairKey] && state.factionOffers[pairKey]) {
      const f = factionPick(state, playerId, null)
      if (!f.error) {
        const r = councilReady(f.state, playerId)
        return { state: r.state, did: r.error ? '' : 'councilReady', error: r.error }
      }
    }
    const r = councilReady(state, playerId)
    return { state: r.state, did: r.error ? '' : 'councilReady', error: r.error }
  }

  /* ---- 结算：直接进下一回合 ---- */
  if (state.phase === 'resolved') {
    if (player.readyNext) return { state, did: '' }
    const r = readyNext(state, playerId)
    return { state: r.state, did: r.error ? '' : 'readyNext', error: r.error }
  }

  return { state, did: '' }
}

/** 全局类型定义：阵营、数值、卡牌、玩家、对局状态 */

export type FactionId = 'SARK' | 'VIC' | 'RI' | 'TARA' | 'REU' | 'SSC'

export type StatKey = 'manpower' | 'supply' | 'morale'

export interface Stats {
  manpower: number
  supply: number
  morale: number
}

/** 行动牌战略轴：同一次发牌中 3 张行动牌轴不重复 */
export type Axis = 'assault' | 'logistics' | 'propaganda' | 'convert' | 'intel' | 'gamble'

/** 指定牌对目标发起的行动类型 */
export type OpKind =
  | 'strike'
  | 'raid'
  | 'siege'
  | 'sabotage'
  | 'incite'
  | 'expose'
  | 'decisive'
  /** 切断补给线：目标本回合补给的正向收益归零（代价照扣） */
  | 'cut'

/** 阵营牌：独立的全局池，仅同盟玩家在结算页选取，下一回合开始前生效 */
export type CardCategory = 'action' | 'designated' | 'faction'

export type SpecialKind =
  | 'immunity'
  | 'cancelCounter'
  | 'truce'
  | 'revive'
  | 'reveal'
  | 'stealSupply'
  | 'transfer'
  | 'coop'
  | 'redirect'
  | 'exchange'
  | 'buyManpower'
  | 'declareVictory'

export interface RollSpec {
  /** 成功概率 0–1 */
  chance: number
  win: Partial<Stats>
  lose: Partial<Stats>
}

export interface CardDef {
  id: string
  owner: FactionId | 'GENERIC'
  name: string
  category: CardCategory
  /** 指定牌所属回合 */
  round?: number
  /** 行动牌战略轴 */
  axis?: Axis
  /** 行动牌资源代价，结算最先扣除 */
  cost?: Partial<Stats>
  effects: Partial<Stats>
  /** 冒险牌：按概率结算收益或反噬 */
  roll?: RollSpec
  /** 指定牌行动类型 */
  op?: OpKind
  /**
   * 指定牌命中时的完整说明。
   * 有它就直接显示它，没有才退回「<操作名>命中 → <通用效果>」——
   * 因为通用操作名未必贴得上牌名（例如「驱逐驻军」配「围困」）。
   */
  hitText?: string
  /** 指定牌可选目标规则 */
  targetRule?: 'hostile' | 'any'
  /** 指定牌落空反噬 */
  backlash?: Partial<Stats>
  /** 行动牌前置要求：必须处于同盟 */
  requiresAlly?: boolean
  /** 关键牌标签，可被针对 */
  tag?: string
  /** 针对目标标签 */
  counterTag?: string
  special?: SpecialKind
  /** 萨卡兹战争进度增量（记在甲方头上） */
  progress?: number
  /**
   * 阵营牌专属：这张交换牌只对哪一对同盟开放。
   * 有序元组 —— pair[0] 结算 effects（甲方），pair[1] 结算 allyEffects（乙方）。
   */
  pair?: [FactionId, FactionId]
  /** 阵营牌专属：乙方一侧的结算结果（正数=获得，负数=付出） */
  allyEffects?: Partial<Stats>
  /** 阵营牌专属：乙方一侧推进的战争进度 */
  allyProgress?: number
  text: string
}

/**
 * 盟约事件的三类走向（用户敲定的规则）：
 * - ally-boon：对已缔结同盟的阵营有利，对孤立阵营有害；
 * - solo-boon：对孤立阵营有利，对已缔结同盟的阵营有害；
 * - internal：同盟成员之间互相有利有弊（只影响同盟内部，孤立者不受牵连）。
 * 触发后从三类里等概率选一类，再从该类里随机抽一张。
 */
export type PactEventKind = 'ally-boon' | 'solo-boon' | 'internal'

/** 每回合公开的盟约事件 */
export interface PactEventDef {
  id: string
  name: string
  /** 三类走向，决定触发后对哪一方有利 */
  kind: PactEventKind
  text: string
  /** 对所有同盟双方生效（internal 类里即「同盟内部互相有利有弊」） */
  allianceEffects?: Partial<Stats>
  /** 对无同盟者生效 */
  soloEffects?: Partial<Stats>
}

export type VictoryKey =
  | 'SARK_WAR'
  | 'VIC_UNITY'
  | 'RI_STOP'
  | 'TARA_INDEPENDENCE'
  | 'REU_PACT'
  | 'SSC_SURVIVE'

export interface VictoryDef {
  title: string
  description: string
  key: VictoryKey
}

export interface FactionDef {
  id: FactionId
  code: string
  name: string
  title: string
  tier: 1 | 2 | 3
  accent: string
  ring: string
  base: Stats
  victory: VictoryDef
  summary: string
}

export interface PlayerState {
  id: string
  name: string
  factionId: FactionId
  stats: Stats
  warProgress: number
  heldDesignated: CardDef | null
  /**
   * 这张保留牌是从第几回合开始留的。
   *
   * 存在的唯一目的：实现「指定牌只能保留一回合」的规则。
   * 没有它就无法区分「这回合刚留的」（下回合必须打出或弃置）和
   * 「已经留了一轮还留着」（违反规则）。
   *
   * 流亡者是唯一例外：规则允许流亡期间跨回合继续保留同一张，
   * 所以判定时要先看 exiled。
   */
  heldKeptRound: number | null
  exileUsed: boolean
  exiled: boolean
  defeated: boolean
  allyId: string | null
  betrayed: boolean
  /** 本回合是否撕毁过盟约（用于盟约事件结算） */
  betrayedThisRound: boolean
  /** 已被成功针对（击穿）的 KEY 标签：一旦记录，相关胜利条件永久失效 */
  nullifiedTags: string[]
  /** 已真正到手的 KEY 标签：本回合打出且未被击穿才获得，是相关胜利条件的前提 */
  keyTags: string[]
}

export interface Pick {
  cards: CardDef[]
  /** 本回合打出的指定牌 */
  designated: CardDef | null
  /** 保留到下一回合的指定牌（上限 1） */
  kept: CardDef | null
  /** 指定牌目标玩家 */
  targetId?: string | null
}

export type GamePhase =
  | 'briefing'
  | 'handoff'
  | 'picking'
  | 'council'
  | 'resolved'
  | 'result'

export type LogTone = 'info' | 'good' | 'bad' | 'counter' | 'pact'

export interface LogEntry {
  round: number
  text: string
  tone: LogTone
}

export interface RoundModifier {
  round: number
  label: string
  story: string
  deltas: Record<FactionId, Partial<Stats>>
}

/**
 * 剧情事件：每回合从该回合的候选池里随机抽 1 个，对**全场**生效。
 *
 * 为什么不是固定剧本（v0.3.0 之前的做法）
 * - 固定剧本意味着每一局的第 3 回合都是「夺剑、萨卡兹士气 +1」，
 *   打两三局之后玩家就能背下来，剧情变成了纯粹的数值噪声；
 * - 改成三选一之后，同一回合在不同局里可能发生不同的事，
 *   玩家必须临场判断「这回合对谁有利」，重玩价值明显提高。
 *
 * 叙事文案跟着事件一起抽：不同事件讲的是不同的事，
 * 不能让「撤离」的标题配「夺剑」的故事。
 */
export interface StoryEventDef {
  /** 全局唯一 id，用于日志与测试断言 */
  id: string
  /** 属于第几回合的候选池 */
  round: number
  /** 短标题，显示在时间轴上 */
  label: string
  /** 叙事文本，显示在回合页与结算页 */
  story: string
  /** 对全场每个阵营的数值影响；未列出的阵营不变 */
  deltas: Record<FactionId, Partial<Stats>>
}

/**
 * 中立资源点：每回合刷出若干个，四人**竞标争夺**。
 *
 * 设计动机：原来的中立援助是「人手一张、各抽各的」，
 * 四个人之间零交互，本质是单人骰子游戏。改成竞标之后：
 * - 你要判断别人会不会抢、愿意出多少；
 * - 出价最高者独得，其余人的出价全部打水漂（够狠才有博弈）；
 * - 出价本身也是从行动牌资源里挤出来的，形成「抢资源 vs 保战力」的取舍。
 */
export interface NeutralPointDef {
  id: string
  /** 资源点名称 */
  name: string
  /** 捞到之后拿到什么 */
  reward: Partial<Stats>
  /** 一句风味文本 */
  flavor: string
  /**
   * 最低出价。出价必须 ≥ 该值才有效；
   * 用来防止「出 1 点碰运气」这种无成本摸奖。
   */
  minBid: number
}

/** 一次竞标的公开结果（结算后对全场公开，过程中的出价保密） */
export interface BidResult {
  /** 资源点 id */
  pointId: string
  pointName: string
  /** 谁赢了；null = 无人有效出价或最高价并列 → 流拍 */
  winnerId: string | null
  winnerName: string
  /** 获胜者实际支付的出价 */
  winningBid: number
  /** 是否有并列最高价导致流拍 */
  tied: boolean
  /** 各玩家的出价（结算后公开，用于复盘）；流拍时也列出来，让玩家知道差在哪 */
  bids: { playerId: string; name: string; amount: number }[]
}

/** 暗选阶段各玩家对资源点的秘密出价 */
export interface Bid {
  /** 出价指向的资源点 id；null = 本回合不参与争夺 */
  pointId: string | null
  /**
   * 出价金额，从「补给」里扣。
   * 允许透支出价（结算层不设下限），但透支本身会让人更容易崩溃，
   * 这属于玩家自己的风险判断，引擎不代劳。
   */
  amount: number
}

export interface GameState {
  players: PlayerState[]
  round: number
  phase: GamePhase
  activeIndex: number
  deck: Record<string, CardDef[]>
  discard: Record<string, CardDef[]>
  neutralDeck: CardDef[]
  neutralDiscard: CardDef[]
  /** 全局阵营牌池（抽完后弃牌堆洗回） */
  factionCardDeck: CardDef[]
  factionCardDiscard: CardDef[]
  /** 结算后待选的阵营牌候选（仅同盟玩家，键为玩家 id） */
  factionOffers: Record<string, CardDef[]>
  /** 已选定、下一回合开始前生效的阵营牌（键为玩家 id） */
  factionPending: Record<string, CardDef>
  /** 阵营牌选择队列：本轮需要选牌的玩家 id，按座次顺序逐个交接 */
  factionPickQueue: string[]
  /** 当前轮到谁选阵营牌；null 表示本轮已选完或无人可选 */
  factionPickerId: string | null
  hand: CardDef[]
  picks: Record<string, Pick>
  pactEvent: PactEventDef | null
  log: LogEntry[]
  roundLog: LogEntry[]
  winner: FactionId | null
  winnerReason: string
  createdAt: number
}

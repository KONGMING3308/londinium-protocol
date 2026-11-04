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
export type OpKind = 'strike' | 'raid' | 'siege' | 'sabotage' | 'incite' | 'expose' | 'decisive'

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
  /** 萨卡兹战争进度增量 */
  progress?: number
  text: string
}

/** 每回合公开的盟约事件 */
export interface PactEventDef {
  id: string
  name: string
  text: string
  /** 对所有同盟双方生效 */
  allianceEffects?: Partial<Stats>
  /** 对无同盟者生效 */
  soloEffects?: Partial<Stats>
  /** 本回合撕约者的额外收益 */
  betrayBonus?: Partial<Stats>
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
  score: number
  warProgress: number
  heldDesignated: CardDef | null
  exileUsed: boolean
  exiled: boolean
  defeated: boolean
  allyId: string | null
  betrayed: boolean
  /** 本回合是否撕毁过盟约（用于盟约事件结算） */
  betrayedThisRound: boolean
  /** 被成功针对过的 KEY 标签 */
  nullifiedTags: string[]
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
  hand: CardDef[]
  picks: Record<string, Pick>
  pactEvent: PactEventDef | null
  log: LogEntry[]
  roundLog: LogEntry[]
  winner: FactionId | null
  winnerReason: string
  createdAt: number
}

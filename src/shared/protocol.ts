/**
 * 联机协议：客户端与 Node 服务端共享的消息 / 视图类型。
 *
 * 设计原则
 * - 服务端权威：所有随机、发牌、结算、判胜都在服务端执行，客户端只提交「意图」。
 * - 视角脱敏：服务端为每位玩家单独生成 MatchView，手牌 / 保留牌 / 胜利条件 / 同盟交换候选
 *   只发给有权看见的人，其他人拿到的是空值或公开替代物。
 * - 全量快照：每次状态变化广播一份完整 RoomView + MatchView。4 人小房间状态很小，
 *   全量比增量可靠得多（不存在补丁丢失、乱序问题），seq 用于客户端丢弃过期快照。
 */
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
  VictoryDef,
} from '@/types'

/** 房间阶段。lobby=大厅等待准备；briefing=开局逐人确认目标；picking=并行暗选；council=盟约窗口；resolved=结算与阵营交换；result=终局 */
export type RoomPhase = 'lobby' | 'briefing' | 'picking' | 'council' | 'resolved' | 'result'

/** 每局固定 4 人 */
export const ROOM_CAPACITY = 4
/** 总回合数（与 victory.ts 的判定节点保持一致） */
export const MAX_ROUND = 7
/** 房间码长度 */
export const ROOM_CODE_LENGTH = 4

/** 公开玩家信息：除了「保留的指定牌」与「保留起始回合」，PlayerState 的其余字段都是全桌可见的。
 *  heldKeptRound 也必须摘掉：它泄露「某人是否正在跨回合保留指定牌」这一暗选行为。 */
export type PublicPlayer = Omit<PlayerState, 'heldDesignated' | 'heldKeptRound'>

/** 大厅里一个座位的对外状态 */
export interface SeatView {
  playerId: string
  name: string
  /** 大厅准备状态 */
  ready: boolean
  /** 连接是否在线 */
  connected: boolean
  isHost: boolean
  /** 开局简报是否已确认自己的目标 */
  briefingAck: boolean
  /** 本回合是否已提交选牌 */
  submittedPick: boolean
  /** 盟约窗口是否已就绪 */
  councilReady: boolean
  /** 结算页是否已点「进入下一回合」 */
  readyNext: boolean
}

/** 房间对外状态（不含对局细节） */
export interface RoomView {
  roomId: string
  phase: RoomPhase
  capacity: number
  hostPlayerId: string
  seats: SeatView[]
  createdAt: number
  /** 大厅阶段：四人是否已全部准备 */
  allReady: boolean
  /** 连接数（含断线占位） */
  onlineCount: number
}

/** 盟约窗口：只把「与我相关」的请求给我，避免全桌围观 */
export interface CouncilView {
  /** 别人向我发起的结盟请求 */
  incoming: { fromId: string; fromName: string } | null
  /** 我向别人发出、尚未被回应的请求 */
  outgoing: { toId: string; toName: string } | null
  /** 我是否已就绪 */
  ready: boolean
  readyCount: number
}

/** 阵营交换牌视图：一对同盟共享候选，只有这对同盟的两人能看见 */
export interface FactionView {
  /** 我的同盟对当前可选的候选牌 */
  offers: CardDef[]
  /** 我是否可以拍板（我的这对还没做决定） */
  canPick: boolean
  /** 我的这对已经谈成的交换（下回合生效） */
  picked: CardDef | null
  /** 全场还有几对同盟没做决定 */
  pendingPairs: number
}

/** 自己的私有信息集合 */
export interface SelfView extends PlayerState {
  /** 本回合手牌（指定牌也在其中） */
  hand: CardDef[]
  /** 自己的胜利条件（其他人的不随视图下发） */
  victory: VictoryDef
  /** 已提交的选牌；未提交为 null。仅用于回显，resolved 阶段清空 */
  submitted: Pick | null
}

/** 一局对局的对外视图 */
export interface MatchView {
  round: number
  maxRound: number
  phase: RoomPhase
  /** 公开的玩家列表 */
  players: PublicPlayer[]
  /** 自己的完整信息 */
  self: SelfView
  pactEvent: PactEventDef | null
  /**
   * 本回合随机抽到的剧情事件（对全场生效）。
   * 下发给所有人是因为它本来就是公开信息——全桌都该知道这回合的天时是什么。
   */
  storyEvent: StoryEventDef | null
  /** 已发生过的剧情事件（按回合），用于时间轴回看 */
  storyHistory: { round: number; label: string }[]
  /** 本回合可争夺的中立资源点 */
  neutralPoints: NeutralPointDef[]
  /** 我对资源点的出价（自己的，已经提交才有） */
  myBid: Bid | null
  /**
   * 已经提交出价的人数。
   * 只暴露人数不暴露内容——「有几个人下手了」本身就是重要信息，
   * 但不给具体数额，否则读人这一层就没了。
   */
  bidCount: number
  /** 上一回合的竞标结果；阶段未结算时为空 */
  bidResults: BidResult[]
  log: LogEntry[]
  roundLog: LogEntry[]
  winner: FactionId | null
  winnerReason: string
  council: CouncilView
  faction: FactionView
  /**
   * 本阶段的服务端截止时间（毫秒时间戳）；null 表示本阶段不计时。
   * 由服务端写入，客户端只用它显示倒计时，绝不据此做权威判断。
   */
  deadline: number | null
  /**
   * 本阶段给玩家的决策时长（毫秒）；null 表示不计时。
   * 下发时长而不是只下发 deadline，是为了让客户端能画出「进度条占了多少」。
   */
  duration: number | null
}

/** 服务端下发的完整快照 */
export interface Snapshot {
  type: 'snapshot'
  /** 单调递增，客户端只接受更大的 seq */
  seq: number
  /**
   * 服务端当前时间。客户端用它校正本地时钟偏差，
   * 避免玩家把系统时间调快/调慢就影响倒计时显示。
   */
  serverNow: number
  room: RoomView
  /** 大厅阶段为 null */
  match: MatchView | null
  /** 重连凭证：客户端存起来，断线后凭它回到原座位 */
  you: { playerId: string; token: string }
}

/** 服务端 → 客户端 */
export type ServerMessage =
  | Snapshot
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; t: number }

/**
 * 指定牌处置方式。
 * play=打出（'held' 打上回合保留的，'new' 打本回合新发的）；keep=保留到下一回合。
 * 两者都为空表示弃置本回合新牌且不留存。
 */
export interface DesignatedAction {
  play: 'held' | 'new' | null
  keep: 'held' | 'new' | null
}

/** 客户端 → 服务端 */
export type ClientMessage =
  /** 创建房间并成为房主 */
  | { type: 'createRoom'; name: string }
  /** 加入房间；带 token 时优先按重连处理 */
  | { type: 'joinRoom'; roomId: string; name: string; token?: string }
  /** 大厅准备状态 */
  | { type: 'setReady'; ready: boolean }
  /** 离开房间（释放座位） */
  | { type: 'leaveRoom' }
  /** 简报页：我已看过自己的目标 */
  | { type: 'briefingAck' }
  /** 提交本回合选牌 */
  | {
      type: 'submitPick'
      /** 选中的 2 张本阵营行动牌，服务端按 id 从手牌里核销 */
      actionCardIds: string[]
      /** 是否接受中立援助（附带那张 GENERIC 行动牌） */
      neutralAccept: boolean
      /** 指定牌处置 */
      designated: DesignatedAction
      /** 指定牌目标玩家 id；未打出指定牌时忽略 */
      targetId?: string | null
      /**
       * 对中立资源点的秘密出价。
       * 省略或 pointId 为 null 表示不参与本回合争夺。
       * 出价从补给里扣，输了也不退。
       */
      bid?: { pointId: string | null; amount: number } | null
    }
  /** 盟约窗口：向某人发起结盟 */
  | { type: 'councilAllyRequest'; targetId: string }
  /** 盟约窗口：回应他人的结盟请求 */
  | { type: 'councilAllyRespond'; fromId: string; accept: boolean }
  /** 盟约窗口：撕毁自己的盟约 */
  | { type: 'councilBreakAlly' }
  /** 盟约窗口：我已就绪 */
  | { type: 'councilReady' }
  /** 结算页：我的同盟对拍板阵营交换牌；cardId=null 表示这回合不谈 */
  | { type: 'factionPick'; cardId: string | null }
  /** 结算页：我已看过结算，准备下一回合 */
  | { type: 'readyNext' }
  /** 心跳 */
  | { type: 'ping'; t: number }

/** 客户端解析消息时的统一信封：解析失败会得到 { ok:false }，不会抛异常 */
export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object') return null
    const type = (v as { type?: unknown }).type
    if (typeof type !== 'string') return null
    return v as ServerMessage
  } catch {
    return null
  }
}

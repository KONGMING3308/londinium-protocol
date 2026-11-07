/**
 * 本地热座调试模式：「浏览器里的假服务端」。
 *
 * 为什么这么做，而不是恢复旧的热座代码
 * - 旧热座版是另一套独立的规则实现（`gameStore` + `gameApi`），和联机版并存必然漂移，
 *   改了一边忘了另一边，调试出来的结果也就不可信了。
 * - 这里复用**同一个** `src/game/engine.ts`：所有校验、发牌、结算、判胜与服务端
 *   完全同源，区别只是「消息不经过 WebSocket，直接在内存里跑」。
 *   于是热座调试模式得出的结论对线上一定成立。
 *
 * 它模拟的东西
 * - 四个座位（默认全部由同一台设备操作，可一键全部准备）
 * - 快照下发：每次状态变化都按「当前视角」脱敏生成，和真实服务端同样的 viewFor
 *
 * 它不模拟的东西
 * - 网络断线与重连（本地没有连接可言）
 * - 多人并发（本地是单线程顺序执行）
 *
 * 这个模块只在开发调试时用 `?local=1` 或首页的调试入口进入，生产环境不会被走到。
 */
import {
  briefingAck,
  canStart,
  councilAllyRequest,
  councilAllyRespond,
  councilBreakAlly,
  councilReady,
  createEngine,
  factionPick,
  joinAsPlayer,
  readyNext,
  setReady,
  snapshotFor,
  startMatch,
  submitPick,
  type EngineState,
} from '@/game/engine'
import { ROOM_CAPACITY } from '@/shared/protocol'
import type { ClientMessage, Snapshot } from '@/shared/protocol'

/** 本地座位：一个座位对应一个玩家 id，热座模式下四个座位都在同一台设备上 */
interface LocalSeat {
  playerId: string
  name: string
  token: string
}

export interface LocalServerOptions {
  /** 四个玩家的名字；少于 4 个会自动补成「玩家N」 */
  names?: string[]
}

type SnapshotListener = (snap: Snapshot) => void

/**
 * 一个极简的「本地服务端」。
 * 接口刻意做成和 `net` 一样的形状（send / onSnapshot），这样 roomStore 不需要知道
 * 背后到底是 WebSocket 还是内存。
 */
export class LocalServer {
  private state: EngineState
  private seats: LocalSeat[] = []
  private seq = 0
  /** 当前视角：热座模式下由界面切换，决定快照里谁是「我」 */
  private viewerId: string | null = null
  private listeners: SnapshotListener[] = []
  private errorListeners: Array<(code: string, message: string) => void> = []
  private readonly connected = new Set<string>()

  constructor(private readonly opts: LocalServerOptions = {}) {
    this.state = createEngine('LOCAL')
  }

  /** 建 4 个本地座位并让房主先「进房」。热座模式开局前就把人建齐，省掉输房间码。 */
  start(): void {
    const names = this.opts.names ?? ['玩家1', '玩家2', '玩家3', '玩家4']
    for (let i = 0; i < ROOM_CAPACITY; i += 1) {
      const name = (names[i] ?? `玩家${i + 1}`).trim() || `玩家${i + 1}`
      const joined = joinAsPlayer(this.state, name)
      if ('error' in joined) break
      this.state = joined.state
      this.seats.push({
        playerId: joined.playerId,
        name,
        token: `local-${joined.playerId}-${i}`,
      })
      this.connected.add(joined.playerId)
    }
    // 第一个座位是房主
    const host = this.seats[0]
    if (host) this.viewerId = host.playerId
    this.emit()
  }

  get seatsView(): ReadonlyArray<LocalSeat> {
    return this.seats
  }

  get currentViewer(): string | null {
    return this.viewerId
  }

  /** 切换视角：热座模式下相当于「把设备交给下一个人」 */
  setViewer(playerId: string): void {
    if (!this.seats.some((s) => s.playerId === playerId)) return
    this.viewerId = playerId
    this.emit()
  }

  /** 一键让四个座位都准备好（调试时最常用） */
  readyAll(ready = true): void {
    for (const seat of this.seats) {
      const r = setReady(this.state, seat.playerId, ready)
      if (!r.error) this.state = r.state
    }
    this.maybeStart()
    this.emit()
  }

  /** 一键让所有未确认简报的人确认（调试时最常用） */
  ackAll(): void {
    for (const seat of this.seats) {
      const r = briefingAck(this.state, seat.playerId)
      if (!r.error) this.state = r.state
    }
    this.emit()
  }

  onSnapshot(fn: SnapshotListener): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn)
    }
  }

  onError(fn: (code: string, message: string) => void): () => void {
    this.errorListeners.push(fn)
    return () => {
      this.errorListeners = this.errorListeners.filter((f) => f !== fn)
    }
  }

  /** 收到一条「客户端消息」。与 server/index.ts 的 handleMessage 同构。 */
  send(msg: ClientMessage): void {
    /** 统一包一层：拿当前视角当操作者，出错只回给调用方，不破坏状态 */
    const act = (fn: (state: EngineState, playerId: string) => { state: EngineState; error?: string }) => {
      const playerId = this.viewerId
      if (!playerId) {
        this.fail('not_in_room', '尚未进入房间。')
        return
      }
      const result = fn(this.state, playerId)
      if (result.error) {
        this.fail('invalid_action', result.error)
        return
      }
      this.state = result.state
      this.maybeStart()
      this.emit()
    }

    switch (msg.type) {
      case 'setReady':
        act((s, id) => setReady(s, id, Boolean(msg.ready)))
        return
      case 'briefingAck':
        act((s, id) => briefingAck(s, id))
        return
      case 'submitPick':
        act((s, id) =>
          submitPick(s, id, {
            actionCardIds: Array.isArray(msg.actionCardIds) ? msg.actionCardIds : [],
            neutralAccept: Boolean(msg.neutralAccept),
            designated:
              msg.designated && typeof msg.designated === 'object'
                ? msg.designated
                : { play: null, keep: null },
            targetId: typeof msg.targetId === 'string' ? msg.targetId : null,
            bid:
              msg.bid && typeof msg.bid === 'object'
                ? {
                    pointId: typeof msg.bid.pointId === 'string' ? msg.bid.pointId : null,
                    amount: Number(msg.bid.amount),
                  }
                : null,
          }),
        )
        return
      case 'councilAllyRequest':
        act((s, id) => councilAllyRequest(s, id, String(msg.targetId ?? '')))
        return
      case 'councilAllyRespond':
        act((s, id) => councilAllyRespond(s, id, String(msg.fromId ?? ''), Boolean(msg.accept)))
        return
      case 'councilBreakAlly':
        act((s, id) => councilBreakAlly(s, id))
        return
      case 'councilReady':
        act((s, id) => councilReady(s, id))
        return
      case 'factionPick':
        act((s, id) => factionPick(s, id, msg.cardId ?? null))
        return
      case 'readyNext':
        act((s, id) => readyNext(s, id))
        return
      case 'createRoom':
      case 'joinRoom':
        // 本地模式已经预设了四个座位，不需要建房 / 进房
        this.fail('invalid_action', '本地调试模式下已固定四个人，无需建房或加入。')
        return
      case 'leaveRoom':
        // 本地模式的「离开」由界面直接退出，不在这里处理
        return
      case 'ping':
        return
      default:
        return
    }
  }

  /** 四人全准备后自动开局，与服务端行为一致 */
  private maybeStart(): void {
    if (this.state.phase !== 'lobby') return
    if (!canStart(this.state)) return
    const r = startMatch(this.state)
    if (!r.error) this.state = r.state
  }

  /** 把当前权威状态按视角脱敏后推给界面 */
  private emit(): void {
    this.seq += 1
    const viewer = this.viewerId
    const you = this.seats.find((s) => s.playerId === viewer)
    const snap = snapshotFor(this.state, viewer, this.connected, this.seq, {
      playerId: you?.playerId ?? '',
      token: you?.token ?? '',
    })
    this.listeners.forEach((fn) => fn(snap))
  }

  private fail(code: string, message: string): void {
    this.errorListeners.forEach((fn) => fn(code, message))
  }
}

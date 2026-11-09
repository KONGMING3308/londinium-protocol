/**
 * 联机传输层：WebSocket 客户端。
 *
 * 职责边界（刻意做窄）
 * - 只管「连上 / 发消息 / 收消息 / 断线重连」，不含任何游戏规则。
 * - 不直接改 React 状态：收到的快照交给 roomStore 处理，避免循环依赖。
 * - 重连采用指数退避，重连后凭本地保存的 token 自动回到原座位。
 */
import { parseServerMessage, type ClientMessage, type Snapshot } from '@/shared/protocol'

type Listener = (snap: Snapshot) => void
type StatusListener = (status: NetStatus) => void
type ErrorListener = (code: string, message: string) => void

export type NetStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

/** 与后端约定的默认地址：同源 /ws，开发期由 vite proxy 转发 */
function defaultUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8787/ws'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

/** 允许用 VITE_WS_URL 覆盖（部署到独立端口时用） */
function resolveUrl(): string {
  const override = import.meta.env.VITE_WS_URL
  if (typeof override === 'string' && override.length > 0) return override
  return defaultUrl()
}

/**
 * 重连身份存放在 src/net/identity.ts：
 * 每标签页一份 sessionStorage + 一份带心跳的「最近会话」快照，
 * 解决「同一浏览器多开两个标签页互相顶号」的问题。这里只做转发。
 */
export type { StoredIdentity } from './identity'
export { loadIdentity, saveIdentity, clearIdentity, loadName } from './identity'

class Net {
  private ws: WebSocket | null = null
  private snapshotHandlers = new Set<Listener>()
  private statusHandlers = new Set<StatusListener>()
  private errorHandlers = new Set<ErrorListener>()
  private outbox: ClientMessage[] = []
  private retry = 0
  private retryTimer: number | null = null
  private heartbeat: number | null = null
  /** 用户主动关闭时不再自动重连 */
  private intentionalClose = false
  private status: NetStatus = 'idle'
  /** 重连时用于自动回到座位 */
  private rejoin: (() => ClientMessage | null) | null = null
  /** 最近一次收到服务端消息的时刻（含 pong），用于判定连接是否已「半死」 */
  private lastSeen = 0
  /** 页面可见性 / 网络恢复监听是否已注册（全局只需一次） */
  private wakeHandlersInstalled = false

  getStatus(): NetStatus {
    return this.status
  }

  onSnapshot(fn: Listener): () => void {
    this.snapshotHandlers.add(fn)
    return () => this.snapshotHandlers.delete(fn)
  }

  onStatus(fn: StatusListener): () => void {
    this.statusHandlers.add(fn)
    return () => this.statusHandlers.delete(fn)
  }

  onError(fn: ErrorListener): () => void {
    this.errorHandlers.add(fn)
    return () => this.errorHandlers.delete(fn)
  }

  private setStatus(s: NetStatus): void {
    if (this.status === s) return
    this.status = s
    this.statusHandlers.forEach((fn) => fn(s))
  }

  /**
   * 注册「重连后重新入座」的消息构造器。
   * 由 roomStore 注入：它知道上次的 roomId/token/name。
   */
  setRejoin(factory: (() => ClientMessage | null) | null): void {
    this.rejoin = factory
  }

  connect(): void {
    if (typeof window === 'undefined') return
    this.installWakeHandlers()
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    this.intentionalClose = false
    const first = this.retry === 0
    this.setStatus(first ? 'connecting' : 'reconnecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(resolveUrl())
    } catch {
      this.scheduleRetry()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.retry = 0
      this.lastSeen = Date.now()
      this.setStatus('open')
      // 重连成功后立刻尝试回到原座位，再补发离线期间排队的消息
      const rejoin = this.rejoin?.() ?? null
      if (rejoin) ws.send(JSON.stringify(rejoin))
      const queued = this.outbox
      this.outbox = []
      queued.forEach((msg) => {
        if (msg.type === 'joinRoom' || msg.type === 'createRoom') return
        ws.send(JSON.stringify(msg))
      })
      this.startHeartbeat()
    }

    ws.onmessage = (ev) => {
      this.lastSeen = Date.now()
      const msg = parseServerMessage(typeof ev.data === 'string' ? ev.data : '')
      if (!msg) return
      if (msg.type === 'snapshot') {
        this.snapshotHandlers.forEach((fn) => fn(msg))
        return
      }
      if (msg.type === 'error') {
        // 错误只作为提示，不改变连接状态；真正的失败会在快照里体现
        this.errorHandlers.forEach((fn) => fn(msg.code, msg.message))
      }
    }

    ws.onclose = () => {
      // 竞态防护：快速「离开再进入」时，旧连接的 onclose 会晚于新连接建立，
      // 若不加判断会清掉新连接的引用，导致新连接变成「无人认领」。
      if (this.ws !== ws) return
      this.ws = null
      this.stopHeartbeat()
      if (this.intentionalClose) {
        this.setStatus('closed')
        return
      }
      this.setStatus('reconnecting')
      this.scheduleRetry()
    }

    ws.onerror = () => {
      // onclose 会紧随其后，这里不重复处理
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return
    const delay = Math.min(8000, 500 * 2 ** this.retry)
    this.retry += 1
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = window.setInterval(() => {
      // 手机切屏 / 休眠后回来的常见状态是「socket 还在，但链路已经死了」：
      // 浏览器的 onclose 要等到 TCP 超时才来，期间玩家点什么都没反应。
      // 服务端每 20 秒内一定会有 pong 或快照，45 秒没有任何消息就直接判死重连。
      if (this.lastSeen > 0 && Date.now() - this.lastSeen > 45000) {
        const dead = this.ws
        this.ws = null
        try {
          dead?.close()
        } catch {
          /* 忽略 */
        }
        this.stopHeartbeat()
        this.setStatus('reconnecting')
        this.scheduleRetry()
        return
      }
      this.send({ type: 'ping', t: Date.now() })
    }, 20000)
  }

  /**
   * 页面重新可见 / 网络恢复时立刻尝试重连。
   *
   * 不装这两个监听的话，切屏太久会让退避定时器停摆，回到前台还得再等一轮退避，
   * 玩家看到的就是「回来卡在重连中」甚至以为掉线了。只注册一次，全局生效。
   */
  private installWakeHandlers(): void {
    if (this.wakeHandlersInstalled || typeof window === 'undefined') return
    this.wakeHandlersInstalled = true
    const wake = () => {
      if (this.intentionalClose) return
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        // 已经有连接：只是把退避清掉，顺手补一条 ping 验证链路
        if (this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }))
          } catch {
            /* 忽略 */
          }
        }
        return
      }
      if (this.retryTimer !== null) {
        window.clearTimeout(this.retryTimer)
        this.retryTimer = null
      }
      this.retry = 0
      this.connect()
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake()
    })
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      window.clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
      return
    }
    // 未连接时排队，但入房 / 建房消息不排队——它们由 rejoin 逻辑负责重放
    if (msg.type === 'joinRoom' || msg.type === 'createRoom') {
      this.connect()
      return
    }
    this.outbox.push(msg)
    if (this.outbox.length > 32) this.outbox.shift()
    this.connect()
  }

  /** 主动断线（离开房间时用），不会再自动重连 */
  close(): void {
    this.intentionalClose = true
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.stopHeartbeat()
    this.ws?.close()
    this.ws = null
    this.outbox = []
    this.setStatus('closed')
  }
}

/** 全应用共用一个连接 */
export const net = new Net()

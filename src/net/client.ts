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

const TOKEN_KEY = 'londinium-protocol-net-token'
const ROOM_KEY = 'londinium-protocol-net-room'
const NAME_KEY = 'londinium-protocol-net-name'

export interface StoredIdentity {
  roomId: string
  playerId: string
  token: string
  name: string
}

/** 读取上次的身份，用于刷新后自动重连 */
export function loadIdentity(): StoredIdentity | null {
  try {
    const roomId = localStorage.getItem(ROOM_KEY)
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!roomId || !raw) return null
    const parsed = JSON.parse(raw) as { playerId?: unknown; token?: unknown }
    if (typeof parsed.playerId !== 'string' || typeof parsed.token !== 'string') return null
    const name = localStorage.getItem(NAME_KEY) ?? ''
    return { roomId, playerId: parsed.playerId, token: parsed.token, name }
  } catch {
    return null
  }
}

export function saveIdentity(roomId: string, playerId: string, token: string, name: string): void {
  try {
    localStorage.setItem(ROOM_KEY, roomId)
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ playerId, token }))
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // 隐私模式下 localStorage 可能不可用，重连能力降级但不影响本局
  }
}

export function clearIdentity(): void {
  try {
    localStorage.removeItem(ROOM_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(NAME_KEY)
  } catch {
    /* 同上 */
  }
}

/** 最后一次加入房间时用的名字，用于重连 */
export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

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
      this.send({ type: 'ping', t: Date.now() })
    }, 20000)
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

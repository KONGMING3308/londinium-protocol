/**
 * 联机房间状态：单一数据源。
 *
 * 客户端不保存「游戏逻辑」，只保存服务端下发的快照。所有操作都是「发意图」，
 * 界面永远跟着快照走——这样 4 台设备看到的规则结果必然一致，也无法作弊。
 *
 * 本地热座调试模式（`?local=1`）
 * - 只是把「传输层」从 WebSocket 换成内存里的 LocalServer，
 *   它调用的是同一个 `src/game/engine.ts`，所以规则与服务端完全同源。
 * - 页面、store、渲染逻辑一行都不用改，调试结论对线上成立。
 */
import { create } from 'zustand'
import {
  clearIdentity,
  loadIdentity,
  loadName,
  net,
  saveIdentity,
  type NetStatus,
} from '@/net/client'
import { LocalServer } from '@/net/localServer'
import type {
  ClientMessage,
  MatchView,
  RoomView,
  ServerMessage,
  Snapshot,
} from '@/shared/protocol'

export type Screen = 'home' | 'lobby' | 'briefing' | 'round' | 'resolve' | 'result'

/** 运行时模式：online=真联机（WebSocket）；local=浏览器内热座调试 */
export type RunMode = 'online' | 'local'

interface RoomStore {
  status: NetStatus
  /** 服务端最新快照的 seq；小于等于它的旧快照会被丢弃 */
  seq: number
  room: RoomView | null
  match: MatchView | null
  playerId: string | null
  token: string | null
  /**
   * 最近一次快照里的服务端时间戳。
   * 倒计时用它校正本地时钟偏差，玩家调系统时间不影响剩余时间显示。
   */
  serverNow: number
  /** 服务端最近一次错误提示，供界面 toast 使用 */
  lastError: { code: string; message: string } | null
  /** 已经发过 join 但还没收到快照 */
  joining: boolean
  /** 当前运行模式 */
  mode: RunMode
  /** 本地模式下可供切换的四个座位（联机模式为空） */
  localSeats: ReadonlyArray<{ playerId: string; name: string }>

  connect: () => void
  /** 进入本地热座调试模式；name 为可选的四个人名字 */
  startLocal: (names?: string[]) => void
  /** 本地模式下切换当前操作者 */
  setLocalViewer: (playerId: string) => void
  /** 本地模式下让四个人全部准备 */
  localReadyAll: () => void
  /** 本地模式下让四个人全部确认简报 */
  localAckAll: () => void
  createRoom: (name: string) => void
  joinRoom: (roomId: string, name: string) => void
  resumeSession: () => boolean
  leaveRoom: () => void
  clearError: () => void

  setReady: (ready: boolean) => void
  briefingAck: () => void
  submitPick: (msg: Omit<Extract<ClientMessage, { type: 'submitPick' }>, 'type'>) => void
  councilAllyRequest: (targetId: string) => void
  councilAllyRespond: (fromId: string, accept: boolean) => void
  councilBreakAlly: () => void
  councilReady: () => void
  factionPick: (cardId: string | null) => void
  readyNext: () => void
}

/** 根据房间阶段推导出该停留在哪个界面（match 只用于判断是否已开局，阶段本身在 room 上） */
export function screenOf(room: RoomView | null): Screen {
  if (!room) return 'home'
  if (room.phase === 'lobby') return 'lobby'
  if (room.phase === 'briefing') return 'briefing'
  if (room.phase === 'picking' || room.phase === 'council') return 'round'
  if (room.phase === 'resolved') return 'resolve'
  return 'result'
}

/** 本地热座模式的「服务端」实例；联机模式下恒为 null */
let local: LocalServer | null = null

export function isLocalMode(): boolean {
  return local !== null
}

/**
 * 统一发送入口：本地模式走内存，联机模式走 WebSocket。
 * 所有 action 都经过这里，页面不需要知道当前是哪种模式。
 */
function dispatch(msg: ClientMessage): void {
  if (local) {
    local.send(msg)
    return
  }
  net.send(msg)
}

export const useRoomStore = create<RoomStore>((set) => ({
  status: 'idle',
  seq: 0,
  room: null,
  match: null,
  playerId: null,
  token: null,
  serverNow: 0,
  lastError: null,
  joining: false,
  mode: 'online',
  localSeats: [],

  connect: () => {
    if (local) return
    net.connect()
  },

  /**
   * 进入本地热座调试模式。
   * 直接把「假服务端」接上，复用同一份 store 与页面，四条座位一次性建好。
   */
  startLocal: (names) => {
    // 先断开真实连接，避免两边快照互相覆盖
    net.close()
    const server = new LocalServer({ names })
    local = server
    set({
      mode: 'local',
      status: 'open',
      seq: 0,
      room: null,
      match: null,
      playerId: null,
      token: null,
      lastError: null,
      joining: false,
    })
    server.onSnapshot((snap) => applySnapshot(snap))
    server.onError((code, message) => {
      set({ lastError: { code, message }, joining: false })
    })
    server.start()
    set({
      localSeats: server.seatsView.map((s) => ({ playerId: s.playerId, name: s.name })),
      playerId: server.currentViewer,
    })
  },

  setLocalViewer: (playerId) => {
    if (!local) return
    local.setViewer(playerId)
    set({ playerId })
  },

  localReadyAll: () => {
    local?.readyAll(true)
  },

  localAckAll: () => {
    local?.ackAll()
  },

  createRoom: (name) => {
    const trimmed = name.trim() || '玩家'
    set({ joining: true, lastError: null })
    net.send({ type: 'createRoom', name: trimmed })
  },

  joinRoom: (roomId, name) => {
    const trimmed = name.trim() || '玩家'
    set({ joining: true, lastError: null })
    net.send({ type: 'joinRoom', roomId: roomId.trim().toUpperCase(), name: trimmed })
  },

  /**
   * 刷新 / 重开后恢复会话：有本地身份就直接带 token 回房。
   * 返回 false 表示没有可恢复的会话。
   */
  resumeSession: () => {
    if (local) return false
    const identity = loadIdentity()
    if (!identity) return false
    set({ joining: true })
    net.send({
      type: 'joinRoom',
      roomId: identity.roomId,
      name: identity.name || loadName() || '玩家',
      token: identity.token,
    })
    return true
  },

  leaveRoom: () => {
    // 本地模式：直接丢掉假服务端回到首页
    if (local) {
      local = null
      set({
        mode: 'online',
        room: null,
        match: null,
        playerId: null,
        token: null,
        seq: 0,
        joining: false,
        lastError: null,
        localSeats: [],
        status: 'closed',
      })
      return
    }
    net.send({ type: 'leaveRoom' })
    clearIdentity()
    net.close()
    set({
      room: null,
      match: null,
      playerId: null,
      token: null,
      seq: 0,
      joining: false,
      lastError: null,
      status: 'closed',
    })
  },

  clearError: () => set({ lastError: null }),

  setReady: (ready) => dispatch({ type: 'setReady', ready }),
  briefingAck: () => dispatch({ type: 'briefingAck' }),
  submitPick: (msg) => dispatch({ type: 'submitPick', ...msg }),
  councilAllyRequest: (targetId) => dispatch({ type: 'councilAllyRequest', targetId }),
  councilAllyRespond: (fromId, accept) => dispatch({ type: 'councilAllyRespond', fromId, accept }),
  councilBreakAlly: () => dispatch({ type: 'councilBreakAlly' }),
  councilReady: () => dispatch({ type: 'councilReady' }),
  factionPick: (cardId) => dispatch({ type: 'factionPick', cardId }),
  readyNext: () => dispatch({ type: 'readyNext' }),
}))

/** 应用快照到 store。seq 保证乱序 / 迟到的快照不会把界面拉回旧状态。 */
function applySnapshot(snap: Snapshot): void {
  const state = useRoomStore.getState()
  if (snap.seq <= state.seq && state.room) return
  // 本地模式没有断线重连的概念，不需要往 localStorage 写身份
  if (!local) {
    saveIdentity(
      snap.room.roomId,
      snap.you.playerId,
      snap.you.token,
      snap.room.seats.find((s) => s.playerId === snap.you.playerId)?.name ?? '',
    )
  }
  useRoomStore.setState({
    seq: snap.seq,
    serverNow: snap.serverNow,
    room: snap.room,
    match: snap.match,
    playerId: snap.you.playerId || state.playerId,
    token: snap.you.token,
    joining: false,
    lastError: null,
  })
}

let wired = false

/**
 * 把 net 的事件接到 store 上。只执行一次（幂等），由 App 挂载时调用。
 * 重连后由这里负责重新入座。
 */
export function wireRoomStore(): () => void {
  if (wired) return () => undefined
  wired = true

  // 重连时自动带 token 回房
  net.setRejoin(() => {
    const identity = loadIdentity()
    if (!identity) return null
    return {
      type: 'joinRoom',
      roomId: identity.roomId,
      name: identity.name || loadName() || '玩家',
      token: identity.token,
    }
  })

  const offSnap = net.onSnapshot((snap) => applySnapshot(snap))
  const offStatus = net.onStatus((status) => useRoomStore.setState({ status }))
  const offError = net.onError((code, message) => {
    useRoomStore.setState({ lastError: { code, message }, joining: false })
  })

  useRoomStore.getState().connect()

  return () => {
    offSnap()
    offStatus()
    offError()
    wired = false
  }
}

export type { ServerMessage }

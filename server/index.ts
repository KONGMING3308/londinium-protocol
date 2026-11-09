/**
 * 联机服务端：HTTP 静态资源 + WebSocket 房间服务。
 *
 * 权威性：所有牌、随机、结算只在服务端发生。客户端发来的只有「意图」，
 * 服务端校验后推进状态，再给每位玩家单独生成脱敏快照。
 *
 * 房间模型：
 * - 一个房间固定 4 个座位，加入顺序即座位顺序。
 * - 每个座位有独立 token，断线后凭 token 回到原座位（手牌保留）。
 * - 四人全部点准备 → 自动开局。
 */
import { randomInt } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  autoActFor,
  briefingAck,
  canStart,
  councilAllyRequest,
  councilAllyRespond,
  councilBreakAlly,
  councilReady,
  createEngine,
  factionPick,
  joinAsPlayer,
  leaveAsPlayer,
  readyNext,
  setReady,
  snapshotFor,
  startMatch,
  submitPick,
  overrideDurations,
  type EngineState,
} from '../src/game/engine.js'
import type { ClientMessage, Snapshot } from '../src/shared/protocol.js'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
/** 静态产物目录：默认用 build 输出的 dist */
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(process.cwd(), 'dist'))
/** 房间空闲多久后回收（毫秒），默认 24 小时（与 token 有效期一致） */
const ROOM_TTL = Number(process.env.ROOM_TTL ?? 24 * 60 * 60 * 1000)
/**
 * 重连凭证的有效期（毫秒），默认 24 小时。
 *
 * 玩家切屏、锁屏、地铁里断网，回来时应该还在原来的座位上——所以座位与 token
 * 要活得比「一局游戏」更久。24 小时是用户明确要求的「保持一天」。
 */
const TOKEN_TTL = Number(process.env.TOKEN_TTL_MS ?? 24 * 60 * 60 * 1000)
/**
 * 全员断线后的座位保留期（毫秒），默认 24 小时。
 *
 * 之前是 3 分钟：四个人一起切屏（手机上太常见了）超过 3 分钟，房间就被回收，
 * token 全部失效，回来只能重开一局。这正是「一切屏就重置」的根因。
 */
const EMPTY_GRACE_MS = Number(process.env.EMPTY_GRACE_MS ?? 24 * 60 * 60 * 1000)
/**
 * 空闲房间数量上限（内存保护）。
 *
 * 座位保留期拉长到一天后，理论上会有很多「没人但还活着」的房间堆着。
 * 4 人小房间的状态只有几十 KB，几百个不构成压力，但不能无上限——
 * 超过这个数就按最久没活动的先回收。
 */
const MAX_IDLE_ROOMS = Number(process.env.MAX_IDLE_ROOMS ?? 500)

/**
 * 各阶段决策时限（毫秒）。默认：暗选 30 秒、盟约 45 秒、简报 60 秒。
 *
 * 允许用环境变量覆盖是为了自动化测试——验证「30 秒不操作会自动推进」
 * 不该真的等 30 秒。生产部署不设这些变量即可，走默认值。
 */
function envMs(name: string): number | null {
  const raw = process.env[name]
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

const PICK_MS = envMs('PHASE_MS_PICKING')
const COUNCIL_MS = envMs('PHASE_MS_COUNCIL')
const BRIEFING_MS = envMs('PHASE_MS_BRIEFING')
const RESOLVED_MS = envMs('PHASE_MS_RESOLVED')
if (PICK_MS !== null || COUNCIL_MS !== null || BRIEFING_MS !== null || RESOLVED_MS !== null) {
  overrideDurations({
    ...(PICK_MS !== null ? { picking: PICK_MS } : {}),
    ...(COUNCIL_MS !== null ? { council: COUNCIL_MS } : {}),
    ...(BRIEFING_MS !== null ? { briefing: BRIEFING_MS } : {}),
    ...(RESOLVED_MS !== null ? { resolved: RESOLVED_MS } : {}),
  })
}

interface Seat {
  playerId: string
  /** 重连凭证：只发给本人，其他人拿不到 */
  token: string
  /** token 过期时刻（毫秒时间戳）。过期后不再承认这条凭证 */
  tokenExpiresAt: number
  /** 当前连接；null 表示断线中，座位与手牌保留 */
  socket: WebSocket | null
  name: string
}

interface Room {
  /** 房间码，与 Map 的 key 一致；单独存一份，避免各处用 state 里的字段 */
  roomId: string
  state: EngineState
  seats: Seat[]
  seq: number
  lastActive: number
  /** 本阶段的超时定时器；阶段一变就要清掉重设 */
  timer: ReturnType<typeof setTimeout> | null
  /** 全员断线的时间戳；null 表示当前至少有一人在线。用于断线宽限期 */
  emptySince: number | null
  /**
   * 全员离线时被「冻结」的剩余决策时间（毫秒）。
   *
   * 有人离线不该被托管掉他还没做的决策——四个人一起切屏时更是如此：
   * 之前 30 秒一到，托管会把全场的牌全部代打一遍，回合白白推进，
   * 玩家切回来发现局已经跑了一大段。现在有人重新连上就按剩余时间继续倒计时。
   */
  pausedRemaining: number | null
}

const rooms = new Map<string, Room>()

/** 房间码字母表：去掉 0/O/1/I 等易混字符 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomChars(n: number): string {
  let out = ''
  for (let i = 0; i < n; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return out
}

function makeRoomCode(): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = randomChars(4)
    if (!rooms.has(code)) return code
  }
  throw new Error('房间码生成失败')
}

function connectedIdsOf(room: Room): Set<string> {
  const ids = new Set<string>()
  room.seats.forEach((s) => {
    if (s.socket && s.socket.readyState === 1) ids.add(s.playerId)
  })
  return ids
}

/** 当前有活连接的座位数（0 = 全员离线） */
function onlineSeatCount(room: Room): number {
  return room.seats.reduce((n, s) => n + (s.socket && s.socket.readyState === 1 ? 1 : 0), 0)
}

/** 造一个新座位，token 从现在起有效 TOKEN_TTL */
function makeSeat(playerId: string, name: string, socket: WebSocket): Seat {
  return {
    playerId,
    token: randomChars(24),
    tokenExpiresAt: Date.now() + TOKEN_TTL,
    socket,
    name,
  }
}

function send(socket: WebSocket, msg: unknown): void {
  if (socket.readyState !== 1) return
  try {
    socket.send(JSON.stringify(msg))
  } catch {
    // 连接已坏，onclose 会负责清理
  }
}

function sendError(socket: WebSocket, code: string, message: string): void {
  send(socket, { type: 'error', code, message })
}

/** 给房间里每位在线玩家单独推送快照（视角不同，必须逐人算） */
function broadcast(room: Room): void {
  room.seq += 1
  room.lastActive = Date.now()
  const online = connectedIdsOf(room)
  room.seats.forEach((seat) => {
    if (!seat.socket || seat.socket.readyState !== 1) return
    // 在线即续期：只要人还在局里，凭证就不该在他专心打牌的时候悄悄过期
    seat.tokenExpiresAt = Date.now() + TOKEN_TTL
    const snap: Snapshot = snapshotFor(room.state, seat.playerId, online, room.seq, {
      playerId: seat.playerId,
      token: seat.token,
    })
    send(seat.socket, snap)
  })
  // 状态每变一次就重新对齐阶段定时器：
  // 推进到新阶段会重设、原地变化（例如某人提交）则沿用同一个 deadline。
  bindDeadline(room)
}

/** 找到某 socket 所在的房间与座位 */
function locate(socket: WebSocket): { room: Room; seat: Seat } | null {
  for (const room of rooms.values()) {
    const seat = room.seats.find((s) => s.socket === socket)
    if (seat) return { room, seat }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * 阶段倒计时与超时托管
 * ------------------------------------------------------------------ */

/** 清掉房间当前的超时定时器 */
function clearRoomTimer(room: Room): void {
  if (room.timer) {
    clearTimeout(room.timer)
    room.timer = null
  }
}

/**
 * 按当前状态的 deadline 重新安排定时器。
 *
 * 每次状态推进后都要调用（bindDeadline 会被挂进广播路径）。
 * 到点后：给所有还没动作的人执行默认操作，然后广播；如果阶段因此推进了，
 * 新的 deadline 会由后续的 broadcast 重新绑定，形成闭环。
 *
 * 全员离线时**不计时**：把剩余时间冻进 pausedRemaining，等人回来再继续。
 * 否则「四个人一起切屏 30 秒」就够让托管把这一回合的所有牌代打完。
 */
function bindDeadline(room: Room): void {
  clearRoomTimer(room)

  const deadline = room.state.deadline
  if (deadline === null) {
    room.pausedRemaining = null
    return
  }
  // 阶段已结束 / 房间已空，不必再计时
  if (room.state.phase === 'lobby' || room.state.phase === 'result') {
    room.pausedRemaining = null
    return
  }
  // 无人在线 → 冻结
  if (onlineSeatCount(room) === 0) {
    room.pausedRemaining = Math.max(0, deadline - Date.now())
    return
  }
  room.pausedRemaining = null

  const delay = Math.max(0, deadline - Date.now())
  room.timer = setTimeout(() => {
    room.timer = null
    try {
      onPhaseTimeout(room)
    } catch (err) {
      // 托管是「兜底」，它自身出错绝不能拖垮整个进程
      console.error('[timer] 超时托管异常（已隔离）：', err)
    }
  }, delay)
  // 定时器不应该阻止进程退出（测试里尤其重要）
  room.timer.unref?.()
}

/**
 * 有人回到房间：把冻结的剩余时间接回 deadline。
 *
 * 不直接恢复原始 deadline —— 那可能已经过期几小时，会导致「一回来就被托管」。
 * 按剩余时长重新计，等于玩家离开时那一刻的倒计时被暂存了。
 */
function thawDeadline(room: Room): void {
  if (room.pausedRemaining === null) return
  const remaining = room.pausedRemaining
  room.pausedRemaining = null
  if (room.state.deadline !== null) {
    room.state = { ...room.state, deadline: Date.now() + remaining }
  }
}

/**
 * 到点：把所有「还没动作」的玩家都托管掉。
 * 只要还有人没动作就逐个补，直到阶段推进或没有可托管的对象。
 */
function onPhaseTimeout(room: Room): void {
  const phase = room.state.phase
  if (phase === 'lobby' || phase === 'result') return
  // 全员离线时兜一层：即使定时器因为某种原因还是响了，也不要替不在场的人出牌
  if (onlineSeatCount(room) === 0) {
    const deadline = room.state.deadline
    room.pausedRemaining = deadline === null ? null : Math.max(0, deadline - Date.now())
    return
  }

  // 最多迭代 8 次（4 人 × 可能的连锁推进），防止意外死循环
  for (let guard = 0; guard < 8; guard += 1) {
    const beforePhase = room.state.phase
    const beforeRound = room.state.round
    let acted = false

    for (const seat of room.seats) {
      const r = autoActFor(room.state, seat.playerId)
      if (r.did) {
        room.state = r.state
        acted = true
      }
    }

    // 阶段或回合变了就停手，让正常流程继续
    if (room.state.phase !== beforePhase || room.state.round !== beforeRound) break
    // 这一轮没人需要托管，说明只剩等别人，退出
    if (!acted) break
  }

  broadcast(room)
}

/** 座位被移出后，如果房间空了就回收；全员断线则进入宽限期而非立即回收 */
function dropRoomIfEmpty(room: Room): void {
  // 座位全被移走（大厅断线离开）→ 立即回收，没有重连对象可等
  if (room.seats.length === 0) {
    clearRoomTimer(room)
    rooms.delete(room.roomId)
    console.log(`[room] ${room.roomId} 无人，回收`)
    return
  }
  // 对局中断线：座位与手牌保留，给一段宽限期等人重连。
  // 立即删房会让「四个人同时刷一下浏览器」整局蒸发，这是不能接受的。
  if (room.seats.every((s) => !s.socket)) {
    if (room.emptySince === null) {
      room.emptySince = Date.now()
      console.log(`[room] ${room.roomId} 全员断线，进入重连宽限期`)
    }
  }
}

/* ------------------------------------------------------------------ *
 * 消息处理
 * ------------------------------------------------------------------ */

/**
 * 把客户端传来的字符串字段归一化。
 * 客户端可能发任何东西（null / 数字 / 对象 / 缺失），而 `.trim()` 只对字符串有效——
 * 直接调用会让服务端抛异常。这里统一收敛成「合法字符串或空串」，
 * 空串交给各自的既有分支去报「房间不存在」之类的正常错误。
 */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function handleCreate(socket: WebSocket, msg: Extract<ClientMessage, { type: 'createRoom' }>): void {
  if (locate(socket)) {
    sendError(socket, 'already_in_room', '你已经在一个房间里了。')
    return
  }
  const roomId = makeRoomCode()
  const joined = joinAsPlayer(createEngine(roomId), asString(msg.name))
  if ('error' in joined) {
    sendError(socket, 'join_failed', joined.error)
    return
  }
  const room: Room = {
    roomId,
    state: joined.state,
    seats: [makeSeat(joined.playerId, asString(msg.name).trim().slice(0, 12) || '房主', socket)],
    seq: 0,
    lastActive: Date.now(),
    timer: null,
    emptySince: null,
    pausedRemaining: null,
  }
  rooms.set(roomId, room)
  console.log(`[room] 创建 ${roomId}，房主 ${room.seats[0].name}`)
  broadcast(room)
}

function handleJoin(socket: WebSocket, msg: Extract<ClientMessage, { type: 'joinRoom' }>): void {
  const roomId = asString(msg.roomId).trim().toUpperCase()
  const room = rooms.get(roomId)
  if (!room) {
    sendError(socket, 'room_not_found', '房间不存在或已解散（长时间没人回来）。请让房主重新建一个。')
    return
  }

  // 0. 大厅里清扫「过期且离线」的占位：否则过期座位会把 4 个位置锁死，谁都进不来
  if (room.state.phase === 'lobby') {
    const stale = room.seats.filter((s) => !s.socket && Date.now() > s.tokenExpiresAt)
    if (stale.length > 0) {
      stale.forEach((s) => {
        room.state = leaveAsPlayer(room.state, s.playerId)
        console.log(`[room] ${roomId} ${s.name} 的重连凭证过期，释放座位`)
      })
      room.seats = room.seats.filter((s) => !stale.includes(s))
    }
  }

  // 1. 重连优先：token 命中就直接坐回原位，手牌与状态全保留
  const token = asString(msg.token)
  if (token) {
    const seat = room.seats.find((s) => s.token === token)
    if (seat) {
      // token 过期：不承认这条凭证，但也不把座位拆掉（本人可能还能用新 token 加入）
      if (Date.now() > seat.tokenExpiresAt) {
        console.log(`[room] ${roomId} ${seat.name} 的 token 已过期，按新玩家处理`)
      } else {
        // 同一座位不应有两条活连接：旧连接先关掉
        if (seat.socket && seat.socket !== socket && seat.socket.readyState === 1) {
          try {
            seat.socket.close()
          } catch {
            /* 忽略 */
          }
        }
        seat.socket = socket
        // 续期：回来一次就重新给满 24 小时，避免中途过期
        seat.tokenExpiresAt = Date.now() + TOKEN_TTL
        room.emptySince = null
        thawDeadline(room)
        console.log(`[room] ${roomId} ${seat.name} 重连`)
        broadcast(room)
        return
      }
    }
    // token 失效（服务端重启 / 过期）→ 继续走普通加入
  }

  if (locate(socket)) {
    sendError(socket, 'already_in_room', '你已经在一个房间里了。')
    return
  }

  // 2. 普通加入
  const joined = joinAsPlayer(room.state, asString(msg.name))
  if ('error' in joined) {
    sendError(socket, 'join_failed', joined.error)
    return
  }
  room.state = joined.state
  const seat = makeSeat(
    joined.playerId,
    asString(msg.name).trim().slice(0, 12) || `玩家${room.seats.length + 1}`,
    socket,
  )
  room.seats.push(seat)
  room.emptySince = null
  thawDeadline(room)
  console.log(`[room] ${roomId} ${seat.name} 加入（${room.seats.length}/4）`)
  broadcast(room)
}

/**
 * 包一层统一处理：定位房间 → 执行引擎操作 → 处理错误 → 自动开局判断 → 广播。
 * 引擎返回 { state, error }；没错误才提交新状态，避免半途状态被写入。
 */
function act(
  socket: WebSocket,
  fn: (state: EngineState, playerId: string) => { state: EngineState; error?: string },
): void {
  const located = locate(socket)
  if (!located) {
    sendError(socket, 'not_in_room', '你还没有加入任何房间。')
    return
  }
  const { room, seat } = located
  let result: { state: EngineState; error?: string }
  try {
    result = fn(room.state, seat.playerId)
  } catch (err) {
    // 引擎异常不能拖垮整个服务端：只回给操作者，其他人的对局继续
    console.error(`[room] ${room.roomId} 引擎异常：`, err)
    sendError(socket, 'internal_error', '服务端处理这条操作时出错。')
    return
  }
  if (!result || !result.state) {
    sendError(socket, 'internal_error', '服务端状态异常。')
    return
  }
  if (result.error) {
    // 状态不提交：任何一条校验失败都整单拒绝，不做部分应用
    sendError(socket, 'invalid_action', result.error)
    return
  }
  room.state = result.state

  // 四人全部准备 → 自动开局
  if (canStart(room.state)) {
    const started = startMatch(room.state)
    if (!started.error) {
      room.state = started.state
      console.log(`[room] ${room.roomId} 四人就绪，开局`)
    }
  }
  broadcast(room)
}

function handleMessage(socket: WebSocket, raw: string): void {
  let msg: ClientMessage
  try {
    msg = JSON.parse(raw) as ClientMessage
  } catch {
    sendError(socket, 'bad_json', '消息不是合法 JSON。')
    return
  }
  if (!msg || typeof msg.type !== 'string') {
    sendError(socket, 'bad_message', '缺少消息类型。')
    return
  }

  switch (msg.type) {
    case 'ping':
      send(socket, { type: 'pong', t: Date.now() })
      return
    case 'createRoom':
      handleCreate(socket, msg)
      return
    case 'joinRoom':
      handleJoin(socket, msg)
      return
    case 'leaveRoom': {
      const located = locate(socket)
      if (!located) return
      const { room, seat } = located
      seat.socket = null
      // 大厅阶段离开 = 真正释放座位；对局中离开 = 保留座位等重连
      if (room.state.phase === 'lobby') {
        room.state = leaveAsPlayer(room.state, seat.playerId)
        room.seats = room.seats.filter((s) => s.playerId !== seat.playerId)
        console.log(`[room] ${room.roomId} ${seat.name} 离开（大厅）`)
      } else {
        console.log(`[room] ${room.roomId} ${seat.name} 离开页面（保留座位）`)
      }
      dropRoomIfEmpty(room)
      if (rooms.has(room.roomId)) broadcast(room)
      return
    }
    case 'setReady':
      act(socket, (state, playerId) => setReady(state, playerId, Boolean(msg.ready)))
      return
    case 'briefingAck':
      act(socket, (state, playerId) => briefingAck(state, playerId))
      return
    case 'submitPick':
      act(socket, (state, playerId) =>
        submitPick(state, playerId, {
          actionCardIds: Array.isArray(msg.actionCardIds) ? msg.actionCardIds : [],
          neutralAccept: Boolean(msg.neutralAccept),
          // `??` 只兜 undefined，`null` 会透传进引擎并在读 .play 时抛错，这里显式判类型
          designated:
            msg.designated && typeof msg.designated === 'object'
              ? msg.designated
              : { play: null, keep: null },
          targetId: asString(msg.targetId) || null,
          // 出价是嵌套对象，逐字段判类型，不能整体透传（客户端可伪造 amount: "1e9"）
          bid:
            msg.bid && typeof msg.bid === 'object'
              ? {
                  pointId: asString(msg.bid.pointId) || null,
                  amount: Number(msg.bid.amount),
                }
              : null,
        }),
      )
      return
    case 'councilAllyRequest':
      act(socket, (state, playerId) => councilAllyRequest(state, playerId, asString(msg.targetId)))
      return
    case 'councilAllyRespond':
      act(socket, (state, playerId) =>
        councilAllyRespond(state, playerId, asString(msg.fromId), Boolean(msg.accept)),
      )
      return
    case 'councilBreakAlly':
      act(socket, (state, playerId) => councilBreakAlly(state, playerId))
      return
    case 'councilReady':
      act(socket, (state, playerId) => councilReady(state, playerId))
      return
    case 'factionPick':
      act(socket, (state, playerId) => factionPick(state, playerId, msg.cardId ?? null))
      return
    case 'readyNext':
      act(socket, (state, playerId) => readyNext(state, playerId))
      return
    default:
      sendError(socket, 'unknown_type', `未知的消息类型：${String((msg as { type: unknown }).type)}`)
  }
}

function handleClose(socket: WebSocket): void {
  const located = locate(socket)
  if (!located) return
  const { room, seat } = located
  seat.socket = null
  /**
   * 断线一律保留座位等重连——大厅阶段也一样。
   *
   * 之前大厅阶段断线等于「离开」：玩家在准备界面刷新一下 / 手机切个屏，
   * 座位就被摘掉，token 随之作废，回来要重新输房间码。那是最常见的「重置」。
   * 真正想离开的人走的是显式 leaveRoom（那个分支才移除座位）。
   */
  console.log(
    `[room] ${room.roomId} ${seat.name} 断线（保留座位，${room.state.phase === 'lobby' ? '大厅' : '对局中'}）`,
  )
  dropRoomIfEmpty(room)
  if (rooms.has(room.roomId)) broadcast(room)
}

/* ------------------------------------------------------------------ *
 * HTTP：静态资源 + 健康检查
 * ------------------------------------------------------------------ */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = (req.url ?? '/').split('?')[0]
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }))
    return
  }
  // 防目录穿越：decode + normalize 后必须仍落在 STATIC_DIR 内。
  // 用 relative() 计算相对路径并拒绝「..」开头的越界访问——startsWith 缺少分隔符，
  // 会把与 dist 同前缀的兄弟目录（如 dist-evil）误判为合法。
  let rel: string
  try {
    rel = normalize(decodeURIComponent(url === '/' ? '/index.html' : url)).replace(/^([/\\])+/, '')
  } catch {
    res.writeHead(400).end('bad request')
    return
  }
  let file = resolve(STATIC_DIR, rel)
  const relFromRoot = relative(STATIC_DIR, file)
  // 逃逸判定：rel 等于 ".."、以 "../" / "..\" 开头，或本身是绝对路径。
  // 不能用 startsWith('..')——那会把 "...." 这种合法目录名也误判成越界。
  const escaped =
    relFromRoot === '..' ||
    relFromRoot.startsWith('..' + sep) ||
    isAbsolute(relFromRoot)
  if (escaped) {
    res.writeHead(403).end('forbidden')
    return
  }
  // SPA 回退：静态文件不存在时交给 index.html，由前端路由接管
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = resolve(STATIC_DIR, 'index.html')
  }
  try {
    const body = readFileSync(file)
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('未找到静态产物，请先执行 npm run build。')
  }
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

function createApp(): Server {
  const server = createServer(serveStatic)
  /**
   * 兜底 error 监听。
   *
   * 为什么不只依赖 startServer 里那个监听：`ws` 在包装 server 时也会挂自己的
   * error 处理，listen 失败时可能在我们 settle 之前就把 error 抛出去，
   * 于是进程直接崩在「未捕获 error 事件」上，绕过所有友好提示。
   * 这里先挂一个永不抛出的监听器占位，真正的错误处理由 startServer 里的
   * 监听器负责（EventEmitter 允许多个监听器，不会互相影响）。
   */
  server.on('error', () => {
    /* 由 startServer 的监听器负责处理；这里只防止未捕获崩溃 */
  })
  // maxPayload：单条消息上限 16KB。正常对局消息只有几百字节，
  // 设上限是为了挡住恶意客户端发超大帧撑爆内存。
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 })
  // 同上：ws 会在底层 server 出错时把 error 转发到自己身上
  wss.on('error', () => {
    /* 由 startServer 的监听器负责处理 */
  })

  wss.on('connection', (socket: WebSocket) => {
    socket.on('message', (data) => {
      // 最外层兜底：任何一条畸形消息都不允许打崩进程。
      // 服务端状态全在内存里，一次未捕获异常 = 所有房间和进行中的对局全部丢失。
      try {
        handleMessage(socket, typeof data === 'string' ? data : data.toString())
      } catch (err) {
        console.error('[ws] 消息处理异常（已隔离，不影响其他玩家）：', err)
        sendError(socket, 'internal_error', '服务端处理消息时出错。')
      }
    })
    socket.on('close', () => handleClose(socket))
    socket.on('error', () => handleClose(socket))
  })

  // 定期回收空闲房间：全员断线超过保留期，或长时间无活动
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [code, room] of rooms) {
      const allOffline = room.seats.every((s) => !s.socket)
      // 全员断线要等到保留期结束才回收，给玩家重连的机会
      const graceExpired =
        allOffline && room.emptySince !== null && now - room.emptySince > EMPTY_GRACE_MS
      if (graceExpired || now - room.lastActive > ROOM_TTL) {
        clearRoomTimer(room)
        rooms.delete(code)
        console.log(`[room] ${code} 超时回收`)
      }
    }
    // 内存保护：座位保留期拉到一天后，空闲房间可能堆积，超过上限按最久没活动的先清
    const idle = [...rooms.values()].filter((r) => r.seats.every((s) => !s.socket))
    if (idle.length > MAX_IDLE_ROOMS) {
      idle
        .sort((a, b) => a.lastActive - b.lastActive)
        .slice(0, idle.length - MAX_IDLE_ROOMS)
        .forEach((room) => {
          clearRoomTimer(room)
          rooms.delete(room.roomId)
          console.log(`[room] ${room.roomId} 空闲房间超上限，回收`)
        })
    }
    // 间隔可调：自动化测试要验证「保留期到点回收」，不能真等 5 分钟
  }, Number(process.env.SWEEP_MS ?? 5 * 60 * 1000))
  sweeper.unref()

  return server
}

/**
 * 供测试用端口 0 起服务。
 *
 * 这里的 error 处理有两个坑，都踩过：
 * 1. 必须用 `on` 而不是 `once`：listen 失败时 Node 可能 emit 不止一次 error，
 *    用 `once` 消费掉第一次后，第二次就没有监听者，会被当成未捕获异常直接崩进程
 *    （表现为甩一堆堆栈，而不是走到我们的友好提示）。
 * 2. settle 之后要把监听器摘掉，否则后续运行期的 error（比如某个连接出错）
 *    会再次 reject 一个已经 resolve 的 promise，行为不可预期。
 */
export function startServer(port = PORT, host = HOST): Promise<{ server: Server; port: number }> {
  const server = createApp()
  return new Promise((resolvePromise, reject) => {
    let settled = false
    const onError = (err: unknown): void => {
      if (settled) return
      settled = true
      server.off('error', onError)
      reject(err)
    }
    const onListening = (): void => {
      if (settled) return
      settled = true
      server.off('error', onError)
      const addr = server.address()
      const actual = typeof addr === 'object' && addr ? addr.port : port
      resolvePromise({ server, port: actual })
    }
    server.on('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

/** 直接执行时才监听端口；被 import 时只导出 */
const invokedDirectly = (() => {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return resolve(entry) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  /**
   * 进程级异常兜底。
   *
   * 为什么必须有：对局状态全部在内存里，一次未捕获异常会让**所有房间**一起消失。
   * 之前的测试报告里出现过「测试结束后服务端 exit code 1，但日志没有明显异常」，
   * 说明确实有某条路径能把异常漏出来。
   *
   * 处理原则：
   * - 记录完整堆栈（否则下次还是查不出），但**不退出进程**；
   * - 单条消息的异常已在 handleMessage 里隔离，这里是最后一道防线；
   * - 真正无法恢复的错误（比如端口没起来）仍在启动流程里显式 exit。
   */
  process.on('uncaughtException', (err) => {
    console.error('[fatal] 未捕获异常（已兜底，服务继续运行）：', err)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] 未处理的 Promise 拒绝（已兜底，服务继续运行）：', reason)
  })

  /**
   * 端口被占用时自动顺延到下一个可用端口。
   *
   * 为什么必须这么做：双击 start.cmd 的人不想读 netstat、也不想 taskkill。
   * 之前的行为是「上次服务端没关干净 → 双击就报一堆堆栈 → 用户以为坏了」。
   * 现在自动换端口继续跑，并明确告诉用户这次用的是哪个端口。
   */
  const tryListen = async (startPort: number, attempts: number): Promise<{ port: number }> => {
    for (let i = 0; i < attempts; i += 1) {
      const p = startPort + i
      try {
        const { port } = await startServer(p, HOST)
        if (i > 0) {
          console.log('')
          console.log(`  端口 ${startPort} 被占用，已自动改用 ${port}。`)
          console.log(`  请让朋友访问 http://<服务器IP>:${port}/ （不是 ${startPort}）`)
        }
        return { port }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code
        // 只有「端口被占」才值得换一个再试；权限错误换端口也没用
        if (code !== 'EADDRINUSE') throw err
      }
    }
    throw Object.assign(new Error(`端口 ${startPort}–${startPort + attempts - 1} 都被占用`), {
      code: 'EADDRINUSE',
    })
  }

  tryListen(PORT, 10)
    .then(({ port }) => {
      console.log('')
      console.log('  伦蒂尼姆协议 · 联机服务端')
      console.log(`  HTTP   http://localhost:${port}/`)
      console.log(`  WS     ws://localhost:${port}/ws`)
      console.log(`  静态   ${STATIC_DIR}`)
      console.log('')
    })
    .catch((err: unknown) => {
      // 走到这里说明连换 10 个端口都不行，或者不是端口问题。
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'EADDRINUSE') {
        console.error('')
        console.error(`  启动失败：端口 ${PORT} ~ ${PORT + 9} 全部被占用。`)
        console.error('')
        console.error('  通常是有多个服务端实例在跑。可以这样处理：')
        console.error(`    1) 查占用端口的进程：netstat -ano | findstr :${PORT}`)
        console.error('       记下最后一列的 PID，再执行：taskkill /PID <PID> /F')
        console.error('    2) 或手动指定别的端口重试：')
        console.error('         set PORT=9000 && start.cmd        (cmd)')
        console.error('         $env:PORT=9000; node server.mjs  (PowerShell)')
        console.error('')
      } else if (code === 'EACCES') {
        console.error('')
        console.error(`  启动失败：没有权限监听端口 ${PORT}。`)
        console.error('  请改用 1024 以上的端口，例如：set PORT=8788 && start.cmd')
        console.error('')
      } else {
        console.error('启动失败：', err)
      }
      process.exit(1)
    })
}

export { rooms }

/**
 * 重新导出，供测试压缩阶段时限用。
 * 生产代码不会用到它——默认时限就是引擎里的 PHASE_DURATION。
 */
export { overrideDurations }

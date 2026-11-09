/**
 * 重连身份的存储层。
 *
 * ## 为什么不能只用 localStorage
 *
 * **同一浏览器的所有标签页共享 localStorage。** 一个人开两个标签页（本机多开自测的
 * 常见做法，也是打不开两台设备时的唯一办法）时会出现：
 *
 * 1. 标签页 A 建房后，身份写进 localStorage；
 * 2. 标签页 B 也建房，把 localStorage 覆盖成 B 的身份；
 * 3. 任何一个标签页刷新或重连，`loadIdentity()` 读到的都是「最后写的那个」，
 *    于是两个标签页拿着**同一个 token** 去抢同一个座位；
 * 4. 服务端看到同一座位来了两条连接，会关掉旧的那条（这是对的，防令牌共享），
 *    于是 A 顶 B、B 顶 A，无限互踢——页面反复「重连中」，看起来就是「炸了」。
 *
 * 顺带还有：两个标签页各自建了房间，谁都进不去对方那间，于是**凭空多出两个房间**。
 *
 * ## 现在的规则
 *
 * - **每个标签页自己的身份存 sessionStorage**：刷新保留、关闭标签页失效、标签页之间天然隔离；
 * - **localStorage 只留一份「最近会话」快照**，用于「标签页被关掉后重新打开还能接着打」；
 * - 新标签页恢复前先看快照的主人**是否还活着**（心跳 15 秒内），活着就**不接管**——
 *   否则又是一个人去抢另一个标签页的座位。
 *
 * 降级：隐私模式下 sessionStorage 也可能不可用，此时回退到「只用 localStorage」的老行为，
 * 功能降级但不崩。
 */

const KEY_TAB = 'londinium-protocol-tab-id'
const KEY_TOKEN = 'londinium-protocol-net-token'
const KEY_ROOM = 'londinium-protocol-net-room'
const KEY_NAME = 'londinium-protocol-net-name'
const KEY_LAST = 'londinium-protocol-net-last'
const KEY_ALIVE_PREFIX = 'londinium-protocol-alive:'

/** 心跳间隔：活着就每 5 秒打一次点 */
const ALIVE_INTERVAL_MS = 5000
/** 超过这个时间没打点，就认为那个标签页已经关了 */
const ALIVE_TTL_MS = 15000

export interface StoredIdentity {
  roomId: string
  playerId: string
  token: string
  name: string
}

/** 供测试注入的最小存储接口（浏览器里由 sessionStorage / localStorage 适配） */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

function wrapStorage(get: () => Storage | null): KeyValueStore {
  const store = (): Storage | null => {
    try {
      return get()
    } catch {
      // 隐私模式下访问 storage 本身就可能抛异常
      return null
    }
  }
  return {
    getItem(key) {
      try {
        return store()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    setItem(key, value) {
      try {
        store()?.setItem(key, value)
      } catch {
        /* 配额超限 / 隐私模式：本次写入失败，不影响本局 */
      }
    },
    removeItem(key) {
      try {
        store()?.removeItem(key)
      } catch {
        /* 同上 */
      }
    },
    keys() {
      const s = store()
      if (!s) return []
      const out: string[] = []
      try {
        for (let i = 0; i < s.length; i += 1) {
          const k = s.key(i)
          if (k !== null) out.push(k)
        }
      } catch {
        return out
      }
      return out
    },
  }
}

/** 内存兜底：storage 完全不可用时至少让单个标签页能玩完这一局 */
function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  }
}

const memory = memoryStore()
let sessionStore: KeyValueStore = memory
let localStore: KeyValueStore = memory
let tabIdCache: string | null = null
let aliveTimer: number | null = null

/** 初始化（浏览器里用真实 storage；测试可注入假的） */
export function initIdentityStorage(session?: KeyValueStore, local?: KeyValueStore): void {
  if (session && local) {
    sessionStore = session
    localStore = local
    tabIdCache = null
    return
  }
  const hasWindow = typeof window !== 'undefined'
  sessionStore = hasWindow ? wrapStorage(() => window.sessionStorage) : memory
  localStore = hasWindow ? wrapStorage(() => window.localStorage) : memory
}

initIdentityStorage()

function randomId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 12)
  return Math.random().toString(36).slice(2, 14)
}

/** 本标签页的 id：sessionStorage 里一旦存在就沿用（刷新后还是同一个标签页） */
export function getTabId(): string {
  if (tabIdCache !== null) return tabIdCache
  const existing = sessionStore.getItem(KEY_TAB)
  if (existing) {
    tabIdCache = existing
    return existing
  }
  const fresh = randomId()
  sessionStore.setItem(KEY_TAB, fresh)
  tabIdCache = fresh
  return fresh
}

function aliveKey(id: string): string {
  return `${KEY_ALIVE_PREFIX}${id}`
}

/** 清掉已经过期的打点记录，避免 localStorage 里堆垃圾 */
function pruneAlive(): void {
  const now = Date.now()
  localStore.keys().forEach((k) => {
    if (!k.startsWith(KEY_ALIVE_PREFIX)) return
    const raw = localStore.getItem(k)
    const ts = raw === null ? NaN : Number(raw)
    if (!Number.isFinite(ts) || now - ts > ALIVE_TTL_MS) localStore.removeItem(k)
  })
}

/** 打点：告诉别的标签页「我还在用这份会话」 */
export function touchAlive(): void {
  localStore.setItem(aliveKey(getTabId()), String(Date.now()))
  pruneAlive()
  if (aliveTimer !== null) return
  if (typeof window === 'undefined') return
  aliveTimer = window.setInterval(() => {
    localStore.setItem(aliveKey(getTabId()), String(Date.now()))
    pruneAlive()
  }, ALIVE_INTERVAL_MS)
  // 标签页关闭时立刻撤掉打点，让下一个标签页能马上接手
  window.addEventListener('pagehide', releaseTab)
}

/** 撤掉本标签页的打点 */
export function releaseTab(): void {
  localStore.removeItem(aliveKey(getTabId()))
}

function isTabAlive(id: string): boolean {
  const raw = localStore.getItem(aliveKey(id))
  const ts = raw === null ? NaN : Number(raw)
  return Number.isFinite(ts) && Date.now() - ts <= ALIVE_TTL_MS
}

interface LastSnapshot extends StoredIdentity {
  tabId: string
  savedAt: number
}

function readLast(): LastSnapshot | null {
  const raw = localStore.getItem(KEY_LAST)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LastSnapshot>
    if (
      typeof parsed.roomId !== 'string' ||
      typeof parsed.playerId !== 'string' ||
      typeof parsed.token !== 'string'
    ) {
      return null
    }
    return {
      roomId: parsed.roomId,
      playerId: parsed.playerId,
      token: parsed.token,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      tabId: typeof parsed.tabId === 'string' ? parsed.tabId : '',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    }
  } catch {
    return null
  }
}

/**
 * 读取本标签页该用的身份。
 *
 * 1. sessionStorage 里有 → 就是本标签页自己的（刷新场景），直接用；
 * 2. 没有（新开的标签页）→ 看 localStorage 的最近会话：
 *    - 若它的主人还活着 → **不接管**，返回 null（否则就会去抢别人的座位）；
 *    - 若它已经死了（标签页关了 / 浏览器重启） → 接着用，这样「关掉再打开能继续打」成立。
 */
export function loadIdentity(): StoredIdentity | null {
  touchAlive()

  const roomId = sessionStore.getItem(KEY_ROOM)
  const raw = sessionStore.getItem(KEY_TOKEN)
  if (roomId && raw) {
    try {
      const parsed = JSON.parse(raw) as { playerId?: unknown; token?: unknown }
      if (typeof parsed.playerId === 'string' && typeof parsed.token === 'string') {
        return {
          roomId,
          playerId: parsed.playerId,
          token: parsed.token,
          name: sessionStore.getItem(KEY_NAME) ?? '',
        }
      }
    } catch {
      /* 落坏了就当没有，走下面的 localStorage 分支 */
    }
  }

  const last = readLast()
  if (!last) return null
  // 别人正活着用这份会话：本标签页只是「邻居」，不接管
  if (last.tabId && last.tabId !== getTabId() && isTabAlive(last.tabId)) return null
  return { roomId: last.roomId, playerId: last.playerId, token: last.token, name: last.name }
}

/** 是否存在「另一个还活着的标签页持有的会话」——首页用它给出提示 */
export function hasForeignActiveSession(): boolean {
  const last = readLast()
  return Boolean(last && last.tabId && last.tabId !== getTabId() && isTabAlive(last.tabId))
}

/** 保存本标签页的身份 */
export function saveIdentity(roomId: string, playerId: string, token: string, name: string): void {
  touchAlive()
  sessionStore.setItem(KEY_ROOM, roomId)
  sessionStore.setItem(KEY_TOKEN, JSON.stringify({ playerId, token }))
  sessionStore.setItem(KEY_NAME, name)
  const snapshot: LastSnapshot = { roomId, playerId, token, name, tabId: getTabId(), savedAt: Date.now() }
  localStore.setItem(KEY_LAST, JSON.stringify(snapshot))
}

/** 清掉本标签页的身份；只清属于自己的那份「最近会话」快照 */
export function clearIdentity(): void {
  sessionStore.removeItem(KEY_ROOM)
  sessionStore.removeItem(KEY_TOKEN)
  sessionStore.removeItem(KEY_NAME)
  const last = readLast()
  if (!last || last.tabId === getTabId()) {
    localStore.removeItem(KEY_LAST)
  }
  releaseTab()
}

/** 最后一次加入房间时用的名字，用于重连 */
export function loadName(): string {
  const own = sessionStore.getItem(KEY_NAME)
  if (own) return own
  const last = readLast()
  if (last?.name) return last.name
  // 首页会往 localStorage 的同名键写昵称，这里兜一层
  return localStore.getItem(KEY_NAME) ?? ''
}

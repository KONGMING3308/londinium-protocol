/**
 * 房间落盘：让「服务端重启」不再导致全场蒸发。
 *
 * 内存里的房间再能扛（座位保留 24 小时、断线不托管、凭证续期也一样）也顶不住
 * 一次 `npm start` 重启 / 一次断电 / 一次部署更新。这条路走通之后：
 * 重启 → 从磁盘读回所有房间的完整引擎状态 → 全员离线宽限期照常计时 →
 * 玩家刷新页面凭 token 回到原座位，回合、手牌、数值全在。
 *
 * ## 设计取舍
 *
 * - **整库一个文件**（`data/rooms.json`）：4 人小房间状态只有几十 KB 量级，
 *   一次写全部比按房间分文件简单可靠（不会出现半个房间落盘的情况）。
 * - **原子写**：先写 `rooms.json.tmp` 再 `rename`，避免进程在写一半时被杀
 *   留下半个 JSON，把下一场的启动搞死。
 * - **节流**：状态每变一次就写盘会很吵（每次出牌、每次准备都要写），
 *   这里攒 800ms 写一次；进程收到 SIGINT/SIGTERM 时强制 flush 一次。
 * - **卡牌按 id 还原**：JSON 里存的卡牌会变成新对象，恢复时按 id 映射回
 *   `src/mocks` 里的规范对象，保证"同一张牌"在内存里始终是同一个引用。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FACTION_ACTIONS, FACTION_CARDS, FACTION_DESIGNATED, GENERIC_CARDS } from '@/mocks'
import type { CardDef } from '@/types'
import type { EngineState } from '@/game/engine'

/** 落盘格式版本：字段结构变了就 +1，老文件会被丢弃而不是乱解析 */
const FORMAT_VERSION = 1

export interface PersistedSeat {
  playerId: string
  token: string
  tokenExpiresAt: number
  name: string
}

/** 房间的可落盘部分（socket / 定时器这类运行时对象不存） */
export interface PersistedRoom {
  roomId: string
  state: EngineState
  seats: PersistedSeat[]
  seq: number
  lastActive: number
  pausedRemaining: number | null
  /** 落盘时刻，用于启动时判断这批数据有多旧 */
  savedAt: number
}

interface FileShape {
  version: number
  savedAt: number
  rooms: PersistedRoom[]
}

/* ------------------------------------------------------------------ *
 * 卡牌引用还原
 * ------------------------------------------------------------------ */

/**
 * 全部卡牌的 id → 规范对象。
 *
 * 恢复时必须把 JSON 里的卡还原成这里的同一个对象：引擎虽然都是按 `.id` 比较，
 * 但留着"同 id 不同引用"的隐患迟早出事，一次映射成本几乎为零。
 */
const CARD_INDEX: Map<string, CardDef> = (() => {
  const map = new Map<string, CardDef>()
  const add = (list: CardDef[]) => {
    list.forEach((c) => {
      if (c && typeof c.id === 'string') map.set(c.id, c)
    })
  }
  Object.values(FACTION_ACTIONS).forEach(add)
  Object.values(FACTION_DESIGNATED).forEach(add)
  add(GENERIC_CARDS)
  add(FACTION_CARDS)
  return map
})()

function reviveCard(value: unknown): CardDef | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<CardDef>
  if (typeof raw.id !== 'string') return null
  // 认得出就用规范对象，认不出（数据文件改过）就退回落盘里的那份
  return CARD_INDEX.get(raw.id) ?? (raw as CardDef)
}

function reviveCardList(value: unknown): CardDef[] {
  if (!Array.isArray(value)) return []
  return value.map(reviveCard).filter((c): c is CardDef => c !== null)
}

function reviveCardListRecord(value: unknown): Record<string, CardDef[]> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, CardDef[]> = {}
  Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
    out[k] = reviveCardList(v)
  })
  return out
}

/** 把落盘的引擎状态还原成内存状态（卡牌换成规范对象） */
export function reviveState(state: EngineState): EngineState {
  const picks: EngineState['picks'] = {}
  Object.entries(state.picks ?? {}).forEach(([playerId, pick]) => {
    if (!pick) return
    picks[playerId] = {
      ...pick,
      cards: reviveCardList(pick.cards),
      designated: reviveCard(pick.designated),
      kept: reviveCard(pick.kept),
    }
  })

  const factionPending: Record<string, CardDef> = {}
  Object.entries(state.factionPending ?? {}).forEach(([k, v]) => {
    const card = reviveCard(v)
    if (card) factionPending[k] = card
  })

  return {
    ...state,
    hands: reviveCardListRecord(state.hands),
    deck: reviveCardListRecord(state.deck),
    discard: reviveCardListRecord(state.discard),
    neutralDeck: reviveCardList(state.neutralDeck),
    neutralDiscard: reviveCardList(state.neutralDiscard),
    factionCardDeck: reviveCardList(state.factionCardDeck),
    factionCardDiscard: reviveCardList(state.factionCardDiscard),
    factionOffers: reviveCardListRecord(state.factionOffers),
    factionPending,
    picks,
    players: (state.players ?? []).map((p) => ({
      ...p,
      heldDesignated: reviveCard(p.heldDesignated),
    })),
  }
}

/* ------------------------------------------------------------------ *
 * 读写
 * ------------------------------------------------------------------ */

export interface Persister {
  /** 落盘目录（便于日志展示） */
  readonly file: string
  /** 启动时读回所有房间；文件不存在或损坏都返回空数组 */
  load(): PersistedRoom[]
  /** 攒一会儿再写（状态每次变化都会调它） */
  schedule(rooms: Iterable<PersistedRoom>): void
  /** 立刻写，进程退出前用 */
  flush(): void
  /** 关掉节流（测试/退出） */
  dispose(): void
}

/**
 * @param dir 落盘目录，默认 `./data`
 * @param debounceMs 攒多久写一次，默认 800ms
 */
export function createPersister(dir: string, debounceMs = 800): Persister {
  const file = join(dir, 'rooms.json')
  const tmp = join(dir, 'rooms.json.tmp')
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: PersistedRoom[] | null = null

  function writeNow(rooms: PersistedRoom[]): void {
    const payload: FileShape = { version: FORMAT_VERSION, savedAt: Date.now(), rooms }
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(tmp, JSON.stringify(payload), 'utf8')
      renameSync(tmp, file)
    } catch (err) {
      // 落盘失败不能拖垮对局：内存里的一切照常运作，只是重启会丢
      console.error('[persist] 写盘失败（对局继续，重启会丢）：', err)
    }
  }

  return {
    file,
    load(): PersistedRoom[] {
      if (!existsSync(file)) return []
      try {
        const raw = readFileSync(file, 'utf8')
        const parsed = JSON.parse(raw) as Partial<FileShape>
        if (parsed.version !== FORMAT_VERSION || !Array.isArray(parsed.rooms)) {
          console.warn(`[persist] 落盘格式不兼容（期望 v${FORMAT_VERSION}），已忽略旧数据`)
          return []
        }
        return parsed.rooms.filter(
          (r): r is PersistedRoom =>
            Boolean(r) && typeof r.roomId === 'string' && Boolean(r.state) && Array.isArray(r.seats),
        )
      } catch (err) {
        console.error('[persist] 读取落盘失败（按空库启动）：', err)
        return []
      }
    },
    schedule(rooms: Iterable<PersistedRoom>): void {
      pending = [...rooms]
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        const list = pending
        pending = null
        if (list) writeNow(list)
      }, debounceMs)
      timer.unref?.()
    },
    flush(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (pending) {
        writeNow(pending)
        pending = null
      }
    },
    dispose(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
    },
  }
}

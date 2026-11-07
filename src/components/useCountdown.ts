/**
 * 倒计时显示用的 hook。
 *
 * 关键点：**倒计时只是显示**，从不用它做权威判断。
 * - 截止时间来自服务端快照里的 `deadline`；
 * - 时钟偏差用快照里带的 `serverNow` 校正，玩家调系统时间不会影响剩余时间；
 * - 到点后不做任何本地推进，等服务器推新快照（服务端超时托管会自己往下走）。
 *
 * 为什么不直接 `deadline - Date.now()`：
 * 客户端时钟可能比服务端快/慢几十秒，直接用会让倒计时一开始就跳成 0 或 99。
 */
import { useEffect, useRef, useState } from 'react'
import { useRoomStore } from '@/store/roomStore'

export interface Countdown {
  /** 剩余毫秒；不计时时为 null */
  remaining: number | null
  /** 本阶段总时长；不计时时为 null */
  duration: number | null
  /** 剩余占比 0–1；不计时时为 null */
  ratio: number | null
  /** 已到期（剩余 <= 0）；不计时时为 false */
  expired: boolean
}

/**
 * 心跳间隔。250ms 足够让秒数看起来平滑，
 * 又不会因为每秒 4 次重渲染拖慢低端设备。
 */
const TICK_MS = 250

/**
 * 把服务端时间换算成本地等效时间。
 * 每次快照到达时记录一次偏差，避免网络延迟造成的抖动被反复累加。
 */
function useServerClockOffset(): number {
  const offsetRef = useRef(0)
  const serverNow = useRoomStore((s) => s.serverNow)

  useEffect(() => {
    if (typeof serverNow === 'number' && serverNow > 0) {
      offsetRef.current = serverNow - Date.now()
    }
  }, [serverNow])

  return offsetRef.current
}

/** 大厅阶段之外才有的倒计时 */
export function useCountdown(
  deadline: number | null | undefined,
  duration: number | null | undefined,
): Countdown {
  const offset = useServerClockOffset()
  const [, force] = useState(0)

  const active = typeof deadline === 'number' && deadline > 0 && typeof duration === 'number' && duration > 0

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => force((n) => n + 1), TICK_MS)
    return () => clearInterval(id)
  }, [active])

  if (!active) {
    return { remaining: null, duration: null, ratio: null, expired: false }
  }

  // 用校正后的「服务端当前时间」来算剩余，而不是裸 Date.now()
  const serverNow = Date.now() + offset
  const remaining = Math.max(0, deadline - serverNow)
  const ratio = Math.max(0, Math.min(1, remaining / duration))

  return {
    remaining,
    duration,
    ratio,
    expired: remaining <= 0,
  }
}

/** 毫秒 → 「12 秒」这种短文案 */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000)
  if (total <= 0) return '0 秒'
  if (total < 60) return `${total} 秒`
  const m = Math.floor(total / 60)
  const s = total % 60
  return s === 0 ? `${m} 分` : `${m} 分 ${s} 秒`
}

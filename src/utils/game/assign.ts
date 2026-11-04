/** 阵营随机分配：6 选 4，且至少存在一对敌对关系 */
import { HOSTILE_PAIRS } from '@/mocks/factions'
import type { FactionId } from '@/types'

const ALL: FactionId[] = ['SARK', 'VIC', 'RI', 'TARA', 'REU', 'SSC']

function shuffle<T>(list: T[]): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function hasHostilePair(ids: FactionId[]): boolean {
  return HOSTILE_PAIRS.some(([a, b]) => ids.includes(a) && ids.includes(b))
}

/** 随机抽 4 个不重复阵营，若没有敌对关系则重抽 */
export function assignFactions(): FactionId[] {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const picked = shuffle(ALL).slice(0, 4)
    if (hasHostilePair(picked)) return picked
  }
  return ['SARK', 'VIC', 'RI', 'TARA']
}

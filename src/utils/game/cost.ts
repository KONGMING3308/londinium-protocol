/** 代价判断的共享实现：选牌面板与发牌保底必须用同一套口径 */
import { STAT_LABEL } from '@/utils/format'
import type { CardDef, Stats } from '@/types'

export const STAT_KEYS: Array<keyof Stats> = ['manpower', 'supply', 'morale']

/** 单张牌的代价是否付得起 */
export function canAfford(card: CardDef, stats: Stats): boolean {
  if (!card.cost) return true
  return STAT_KEYS.every((k) => (card.cost?.[k] ?? 0) <= stats[k])
}

/** 代价缺口描述，用于卡面提示 */
export function costShortage(card: CardDef, stats: Stats): string | null {
  if (!card.cost) return null
  const gaps = STAT_KEYS.filter((k) => (card.cost?.[k] ?? 0) > stats[k]).map(
    (k) => `${STAT_LABEL[k]}缺 ${(card.cost?.[k] ?? 0) - stats[k]}`,
  )
  return gaps.length > 0 ? gaps.join('、') : null
}

/** 一组牌的合计代价 */
export function totalCost(cards: CardDef[]): Partial<Stats> {
  const sum: Partial<Stats> = {}
  cards.forEach((c) => {
    if (!c.cost) return
    STAT_KEYS.forEach((k) => {
      const v = c.cost?.[k]
      if (v) sum[k] = (sum[k] ?? 0) + v
    })
  })
  return sum
}

/** 一组牌里当前付得起的张数 */
export function affordableCount(cards: CardDef[], stats: Stats): number {
  return cards.filter((c) => canAfford(c, stats)).length
}

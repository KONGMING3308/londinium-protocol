/** 展示层格式化工具 */
import type { PartialStatsLike } from '@/types/ui'
import type { Axis, OpKind, Stats } from '@/types'

export const STAT_LABEL: Record<keyof Stats, string> = {
  manpower: '人力',
  supply: '补给',
  morale: '士气',
}

export const STAT_COLOR: Record<keyof Stats, string> = {
  manpower: 'bg-rose-500',
  supply: 'bg-amber-500',
  morale: 'bg-sky-500',
}

export const AXIS_LABEL: Record<Axis, string> = {
  assault: '强攻',
  logistics: '补给线',
  propaganda: '宣传',
  convert: '转化',
  intel: '情报',
  gamble: '冒险',
}

export const AXIS_COLOR: Record<Axis, string> = {
  assault: 'bg-rose-500/20 text-rose-200',
  logistics: 'bg-amber-500/20 text-amber-200',
  propaganda: 'bg-sky-500/20 text-sky-200',
  convert: 'bg-violet-500/20 text-violet-200',
  intel: 'bg-emerald-500/20 text-emerald-200',
  gamble: 'bg-fuchsia-500/20 text-fuchsia-200',
}

export const OP_LABEL: Record<OpKind, string> = {
  strike: '打击',
  raid: '掠夺',
  siege: '围困',
  sabotage: '破坏',
  incite: '策反',
  expose: '揭穿',
  decisive: '对决',
}

export const OP_HIT: Record<OpKind, string> = {
  strike: '目标士气 -4，自身士气 +1',
  raid: '夺取目标 3 补给',
  siege: '目标补给 -3，自身战绩 +3（标注战争进度的牌额外推进）',
  sabotage: '目标指定牌失效，自身士气 +1',
  incite: '解除目标同盟，自身士气 +1',
  expose: '公开目标行动牌，自身补给 +1',
  decisive: '人力差 ≥3 时夺 5 补给并压制士气',
}

export function effectText(effects: PartialStatsLike): string {
  const keys: Array<keyof Stats> = ['manpower', 'supply', 'morale']
  return keys
    .filter((k) => effects[k])
    .map((k) => `${STAT_LABEL[k]}${effects[k]! > 0 ? '+' : ''}${effects[k]}`)
    .join('　')
}

/** 代价是结算时扣除的值，展示为负数 */
export function costText(cost: PartialStatsLike): string {
  const negated: PartialStatsLike = {}
  ;(Object.keys(cost) as Array<keyof Stats>).forEach((k) => {
    if (cost[k]) negated[k] = -cost[k]!
  })
  return effectText(negated)
}

export function formatRound(round: number): string {
  return `R${round}`
}

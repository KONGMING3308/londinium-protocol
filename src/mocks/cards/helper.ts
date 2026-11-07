/** 卡牌构造辅助，压缩数据文件的样板代码 */
import type { Axis, CardDef, FactionId, OpKind, Stats } from '@/types'

interface ActionExtra {
  cost?: Partial<Stats>
  roll?: CardDef['roll']
  requiresAlly?: boolean
  special?: CardDef['special']
  text?: string
}

export function actionCard(
  owner: FactionId | 'GENERIC',
  id: string,
  name: string,
  axis: Axis,
  effects: Partial<Stats>,
  text: string,
  extra: ActionExtra = {},
): CardDef {
  return { id, owner, name, category: 'action', axis, effects, text, ...extra }
}

interface FactionExtra {
  progress?: number
  allyProgress?: number
}

/**
 * 阵营「交换」牌：一张牌同时写两边。
 * pair 有序 —— 甲方吃 effects，乙方吃 allyEffects；谁选中都按阵营结算，
 * 所以同一张牌由萨卡兹选还是由深池选，结果完全一致。
 */
export function factionCard(
  id: string,
  name: string,
  pair: [FactionId, FactionId],
  effects: Partial<Stats>,
  allyEffects: Partial<Stats>,
  text: string,
  extra: FactionExtra = {},
): CardDef {
  return {
    id,
    owner: 'GENERIC',
    name,
    category: 'faction',
    effects,
    allyEffects,
    pair,
    text,
    ...extra,
  }
}

interface DesignatedExtra {
  hitText?: string
  effects?: Partial<Stats>
  backlash?: Partial<Stats>
  targetRule?: 'hostile' | 'any'
  tag?: string
  counterTag?: string
  progress?: number
  special?: CardDef['special']
}

export function designatedCard(
  owner: FactionId,
  id: string,
  name: string,
  round: number,
  op: OpKind,
  text: string,
  extra: DesignatedExtra = {},
): CardDef {
  return {
    id,
    owner,
    name,
    category: 'designated',
    round,
    op,
    effects: {},
    targetRule: 'hostile',
    text,
    ...extra,
  }
}

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
  special?: CardDef['special']
  progress?: number
  requiresAlly?: boolean
}

export function factionCard(
  id: string,
  name: string,
  effects: Partial<Stats>,
  text: string,
  extra: FactionExtra = {},
): CardDef {
  return { id, owner: 'GENERIC', name, category: 'faction', effects, text, ...extra }
}

interface DesignatedExtra {
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

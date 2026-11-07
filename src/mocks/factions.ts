/**
 * 阵营定义：初始数值、胜利条件、配色
 * 依赖：types/index.ts
 */
import type { FactionDef, FactionId } from '@/types'

export const FACTIONS: FactionDef[] = [
  {
    id: 'SARK',
    code: 'SARK',
    name: '萨卡兹军事委员会',
    title: '让风暴成为襁褓',
    tier: 1,
    accent: 'from-rose-900/80 to-rose-700/40',
    ring: 'ring-rose-500/50',
    base: { manpower: 12, supply: 12, morale: 6 },
    victory: {
      title: '战争进度 ≥ 3',
      description: '终局战争进度 ≥ 3，且终局士气 ≥ 10。战争进度仅由萨卡兹指定牌命中后推进，落空、被挡下或被击穿均不推进。',
      key: 'SARK_WAR',
    },
    summary: '占领伦蒂尼姆的摄政王，军力最强、内部离心，靠飞空艇与阿喃那改写族群命运。',
  },
  {
    id: 'VIC',
    code: 'VIC',
    name: '典范军',
    title: '诸王之息',
    tier: 2,
    accent: 'from-amber-800/80 to-amber-600/40',
    ring: 'ring-amber-500/50',
    base: { manpower: 9, supply: 8, morale: 8 },
    victory: {
      title: '国剑 + 三线≥12',
      description: '握有国剑且未被击穿（须打出「夺回国剑」），终局人力、补给、士气均 ≥12，且至少一名其他阵营曾崩溃（流亡或出局）。',
      key: 'VIC_UNITY',
    },
    summary: '阿斯兰王嗣维娜重返首都，以国剑收拢诸公爵，代价是必须有人倒下。',
  },
  {
    id: 'RI',
    code: 'RI',
    name: '罗德岛',
    title: '阻止战争',
    tier: 2,
    accent: 'from-sky-900/80 to-sky-600/40',
    ring: 'ring-sky-500/50',
    base: { manpower: 7, supply: 8, morale: 10 },
    victory: {
      title: '阿喃那被针对，或无人获胜',
      description: '成功反制【阿喃那】；或终局无人达成目标且自身士气最高、≥13。',
      key: 'RI_STOP',
    },
    summary: '精锐小队与巴别塔旧部，目标不是赢，而是让别人赢不了。',
  },
  {
    id: 'TARA',
    code: 'TARA',
    name: '塔拉／深池',
    title: '红龙咬死红龙',
    tier: 3,
    accent: 'from-purple-900/80 to-purple-600/40',
    ring: 'ring-purple-500/50',
    base: { manpower: 8, supply: 7, morale: 8 },
    victory: {
      title: '塔拉独立未被针对',
      description: '握有塔拉独立且未被击穿（须打出「塔拉独立」），且典范军未获胜时终局士气 ≥13；若本局无典范军，改为终局士气 ≥15 且全场最高。',
      key: 'TARA_INDEPENDENCE',
    },
    summary: '以恐怖与煽动起家的民族主义武装，爱布拉娜要让塔拉从典范军手中撕裂出去。',
  },
  {
    id: 'REU',
    code: 'REU',
    name: '整合运动',
    title: '为所有被压迫者',
    tier: 3,
    accent: 'from-orange-900/80 to-orange-600/40',
    ring: 'ring-orange-500/50',
    base: { manpower: 5, supply: 4, morale: 7 },
    victory: {
      title: '新纲领成立 + 双线≥10',
      description: '握有新纲领且未被击穿（须打出「新纲领」），终局人力、补给、士气中至少两项 ≥10，且至少一名其他阵营曾崩溃（流亡或出局）。',
      key: 'REU_PACT',
    },
    summary: '从感染者反抗军转向跨种族统一战线，革命只在废墟上成立。',
  },
  {
    id: 'SSC',
    code: 'SSC',
    name: '市民自救军',
    title: '让这座城市活下去',
    tier: 3,
    accent: 'from-emerald-900/80 to-emerald-600/40',
    ring: 'ring-emerald-500/50',
    base: { manpower: 4, supply: 5, morale: 8 },
    victory: {
      title: '存活到终局',
      description: '自身从未流亡或崩溃，终局士气 ≥13，且至少两名其他阵营从未流亡或崩溃。',
      key: 'SSC_SURVIVE',
    },
    summary: '不争王权的平民武装，掌握地下网络与工人动员，只求不被当作筹码。',
  },
]

export const FACTION_MAP: Record<FactionId, FactionDef> = FACTIONS.reduce(
  (acc, f) => ({ ...acc, [f.id]: f }),
  {} as Record<FactionId, FactionDef>,
)

/** 可结盟关系（基于原作剧情，⚔ 敌对永不结盟） */
export const ALLIANCE_PAIRS: Array<[FactionId, FactionId]> = [
  ['SARK', 'TARA'],
  ['VIC', 'RI'],
  ['VIC', 'SSC'],
  ['RI', 'REU'],
  ['RI', 'SSC'],
  ['REU', 'SSC'],
]

export const HOSTILE_PAIRS: Array<[FactionId, FactionId]> = [
  ['SARK', 'VIC'],
  ['SARK', 'RI'],
  ['SARK', 'REU'],
  ['SARK', 'SSC'],
  ['VIC', 'TARA'],
  ['VIC', 'REU'],
  ['RI', 'TARA'],
  ['TARA', 'REU'],
  ['TARA', 'SSC'],
]

export function canAlly(a: FactionId, b: FactionId): boolean {
  return ALLIANCE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

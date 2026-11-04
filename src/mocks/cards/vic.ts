/** 典范军：10 张行动牌（六轴）+ 7 张指定牌 */
import { actionCard, designatedCard } from './helper'

const R = 'VIC' as const

export const VIC_ACTIONS = [
  actionCard(R, 'V-A1', '蒸汽骑士遗物', 'assault', { manpower: 4 }, '旧时代的甲胄还能再战一场，但需要先喂饱它。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'V-A2', '感染者部队', 'assault', { manpower: 3, morale: 1 }, '被排斥的人愿意为一位王储而战，代价是军心浮动。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'V-A3', '自救军补给线', 'logistics', { supply: 3, manpower: 1 }, '市民把仅存的面包送进王储的车队，前提是同盟仍在。', {
    requiresAlly: true,
  }),
  actionCard(R, 'V-A4', '公爵的援助', 'logistics', { supply: 3, morale: 1 }, '开斯特送来一批军械，账单悄然记在声望上。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'V-A5', '王嗣宣言', 'propaganda', { morale: 4, supply: -1 }, '维娜站上议会广场，宣称王位，声音传遍全城。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'V-A6', '议会广场演讲', 'propaganda', { morale: 3, supply: -1 }, '演说换来了士气，也换来了更高的期待。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'V-A7', '公爵宴会', 'convert', { morale: 3, manpower: 1 }, '宴会上的每一杯酒都标着价码，也买回了骑士。', {
    cost: { supply: 2 },
  }),
  actionCard(R, 'V-A8', '王宫密道', 'convert', { supply: 3, manpower: 1 }, '密道通向上城，声望换来了物资与一条退路。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'V-A9', '格拉斯哥帮情报', 'intel', { supply: 2 }, '因陀罗的帮众把每条街的布防画在墙上。', {
    cost: { supply: 1 },
    special: 'reveal',
  }),
  actionCard(R, 'V-A10', '阿勒黛的遗物', 'gamble', {}, '灰烬里捡回的甲胄，也许还能成立一支新的典范军。', {
    roll: { chance: 0.5, win: { manpower: 3, supply: 2 }, lose: { supply: -2 } },
  }),
]

export const VIC_DESIGNATED = [
  designatedCard(R, 'V-D1', '仪仗威慑', 1, 'strike', '王宫仪仗开上街头，向敌对势力展示王权仍在。', {
    effects: { morale: 1 },
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'V-D2', '王庭动员', 2, 'raid', '王庭动员的骑士洗劫了敌对势力的补给站。', {
    backlash: { supply: -3 },
  }),
  designatedCard(R, 'V-D3', '夺回国剑', 3, 'siege', '维娜握住诸王之息，王权重新有了实体。', {
    tag: '国剑',
    effects: { morale: 2 },
    backlash: { supply: -4 },
  }),
  designatedCard(R, 'V-D4', '诸王长眠之所', 4, 'strike', '打开诸王长眠之所，王室的意志压向敌对阵营。', {
    effects: { manpower: 1 },
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'V-D5', '海上封锁', 5, 'raid', '威灵顿的舰队封锁航道，截断对手的海上补给。', {
    effects: { supply: 1 },
    backlash: { supply: -3 },
  }),
  designatedCard(R, 'V-D6', '讨伐塔拉', 6, 'incite', '以王权之名讨伐塔拉，同时离散其外部支持。', {
    counterTag: '塔拉独立',
    effects: { manpower: 1 },
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'V-D7', '议会清算', 7, 'incite', '议会清算异己，迫使敌对者的同盟重新站队。', {
    effects: { supply: 1 },
    backlash: { morale: -2 },
  }),
]

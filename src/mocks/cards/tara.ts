/** 塔拉／深池：12 张行动牌（六轴各 2 张）+ 7 张指定牌 */
import { actionCard, designatedCard } from './helper'

const R = 'TARA' as const

export const TARA_ACTIONS = [
  actionCard(R, 'T-A1', '深池募兵', 'assault', { manpower: 4, morale: 1 }, '矿工与农民拿起了枪，队伍变得难以约束。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'T-A2', '深池六人众', 'assault', { manpower: 3, morale: 1 }, '六位头目各自带来一批亡命之徒，也带来一点声望。', {
    cost: { supply: 2 },
  }),
  actionCard(R, 'T-A3', '威灵顿的默许', 'logistics', { supply: 2, morale: 1 }, '公爵的舰队没有拦截塔拉的补给船，但只对盟友开放。', {
    requiresAlly: true,
  }),
  actionCard(R, 'T-A4', '紫火余烬', 'logistics', { supply: 4 }, '火焰熄灭后的余烬仍能锻铁，只是要先烧掉一些补给。', {
    cost: { supply: 2 },
  }),
  actionCard(R, 'T-A5', '民族主义宣传', 'propaganda', { morale: 4 }, '广播里只有一句话：塔拉属于塔拉人。', {
    cost: { supply: 2 },
  }),
  actionCard(R, 'T-A6', '西尔莎的报道', 'propaganda', { morale: 3, supply: -1 }, '记者的最后一篇报道在街头被反复传抄。', {
    cost: { manpower: 1 },
  }),
  actionCard(R, 'T-A7', '塔拉语复兴', 'convert', { morale: 2, manpower: 3 }, '被禁止的语言重新出现在墙上，也重新聚起了人。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'T-A8', '深池渗透', 'convert', { supply: 2 }, '探子混入敌营，把对方的物资一车车运回塔拉。', {
    cost: { morale: 1 },
    special: 'stealSupply',
  }),
  actionCard(R, 'T-A9', '影子领袖', 'intel', { supply: 3, morale: 1 }, '拉芙希妮站在台上，却只是姐姐的影子，影子看得更清楚。', {
    cost: { morale: 1 },
    special: 'reveal',
  }),
  actionCard(R, 'T-A10', '红龙的咆哮', 'gamble', {}, '龙啸压过炮声：要么震碎敌胆，要么暴露自己。', {
    roll: { chance: 0.5, win: { morale: 4, manpower: 1 }, lose: { morale: -3 } },
  }),
  actionCard(R, 'T-A11', '矿井眼线', 'intel', { supply: 2, manpower: 2 }, '矿工们比情报局更早知道敌人的运输路线。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'T-A12', '地下赌档', 'gamble', {}, '矿井里的赌档押的是塔拉人的运气，赢了能吃饱，输了只剩债。', {
    roll: { chance: 0.55, win: { supply: 3, manpower: 1 }, lose: { supply: -2 } },
  }),
]

export const TARA_DESIGNATED = [
  designatedCard(R, 'T-D1', '断补给线', 1, 'raid', '切断铁路与仓库，把对手的补给变成塔拉的补给。', {
    backlash: { supply: -3 },
  }),
  designatedCard(R, 'T-D2', '驱逐驻军', 2, 'siege', '围住敌对势力的驻军营地，逼他们在缺粮中撤退。', {
    backlash: { supply: -4 },
  }),
  designatedCard(R, 'T-D3', '焚烧王旗', 3, 'strike', '当街焚烧典范军王旗，王权的象征随之焦黑。', {
    counterTag: '国剑',
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'T-D4', '民众动员', 4, 'incite', '动员对方的街区倒向塔拉，离散他们与盟友的联系。', {
    targetRule: 'any',
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'T-D5', '游击战', 5, 'decisive', '小队在街巷间与对手正面周旋，比的是谁更熟悉这座城市。', {
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'T-D6', '塔拉独立', 6, 'decisive', '威灵顿与爱布拉娜共同宣布：塔拉不再是典范军的一部分。', {
    tag: '塔拉独立',
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'T-D7', '深池渗透', 7, 'expose', '探子潜入整合运动的集会，把新纲领的底稿抄了出来。', {
    counterTag: '新纲领',
    backlash: { supply: -2 },
  }),
]

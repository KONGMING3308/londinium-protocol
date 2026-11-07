/** 罗德岛：10 张行动牌（六轴）+ 7 张指定牌 */
import { actionCard, designatedCard } from './helper'

const R = 'RI' as const

export const RI_ACTIONS = [
  actionCard(R, 'R-A1', '精英干员出动', 'assault', { manpower: 3, morale: 1 }, 'Misery 与阿斯卡纶同时出现在战场上。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'R-A2', '精英小队突袭', 'assault', { manpower: 4 }, '小队切入宿敌后方，打完就走，只留下疲惫。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'R-A3', '可露希尔的仓库', 'logistics', { supply: 3 }, '仓库里的货来路不明，但确实能用。', {}),
  actionCard(R, 'R-A4', '医疗协议', 'logistics', { supply: 2, morale: 1 }, '罗德岛开出一条运输通道，药品与伤员同时在路上；若队伍已转入流亡，这份协议能把人从死亡线上拉回来。', {
    cost: { manpower: 2 },
    special: 'revive',
  }),
  actionCard(R, 'R-A5', '医疗救援', 'propaganda', { morale: 4 }, '医疗队把伤员从废墟里拖出来，城市记住了这面旗。', {
    cost: { manpower: 1 },
  }),
  actionCard(R, 'R-A6', '阿米娅的戒指', 'propaganda', { morale: 3, manpower: 1 }, '又一枚戒指碎裂，力量与代价同时增加。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'R-A7', '可露希尔走私', 'convert', { supply: 3, manpower: 1 }, '用信誉换货，再用货换人。', {
    cost: { morale: 2 },
  }),
  actionCard(R, 'R-A8', '凯尔希的诊断', 'convert', { supply: 3, morale: 1 }, '凯尔希说：还有时间，但不多。她把资源压给了前线。', {
    cost: { manpower: 1 },
  }),
  actionCard(R, 'R-A9', '无人机侦察', 'intel', { morale: 2 }, '无人机掠过城防炮，记下了每一处炮位。', {
    cost: { supply: 1 },
    special: 'reveal',
  }),
  actionCard(R, 'R-A10', '巴别塔档案', 'gamble', { supply: 3, morale: 1 }, '旧档案一页页摊开：对手下一步的部署全在里面，代价是通宵翻找。', {
    cost: { manpower: 2 },
  }),
]

export const RI_DESIGNATED = [
  designatedCard(R, 'R-D1', '潜入', 1, 'expose', '以废品回收企业的名义进入首都，摸清对手的底牌。', {
    tag: '潜入',
    backlash: { supply: -2 },
  }),
  designatedCard(R, 'R-D2', '营救市民', 2, 'raid', '从敌对势力的封锁区撤出市民，顺手带走他们的物资。', {
    backlash: { supply: -3 },
  }),
  designatedCard(R, 'R-D3', '联合阵线', 3, 'incite', '说服对手的盟友重新考虑立场，瓦解一条阵线。', {
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'R-D4', '打击飞空艇', 4, 'sabotage', '干扰飞空艇的通讯，让它的升空变成一场哑剧。', {
    counterTag: '飞空艇',
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'R-D5', '打击生命脊椎', 5, 'sabotage', '巨兽骸骨上的补给线被切断，萨卡兹的投送随之受阻。', {
    counterTag: '生命脊椎',
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'R-D6', '斩首行动', 6, 'decisive', '精锐小队与对方指挥官正面交锋，胜负只在一瞬。', {
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'R-D7', '阻止阿喃那', 7, 'sabotage', '阿米娅接过冠冕，也接过了打断仪式的责任。', {
    counterTag: '阿喃那',
    backlash: { morale: -2 },
  }),
]

/** 阵营牌：全局共用一池，仅同盟玩家在结算页选取，下一回合开始前生效 */
import { factionCard } from './helper'

export const FACTION_CARDS = [
  factionCard('F-01', '联军的军议', { manpower: 3 }, '四方的旗手围坐一桌，把各自的难处摊开，再分走彼此的余力。', {
    special: 'transfer',
  }),
  factionCard('F-02', '共同的粮道', { supply: 3 }, '粮车不再分属哪一面旗，沿着同一条路走向两座营地。', {
    special: 'transfer',
  }),
  factionCard('F-03', '并肩的旗帜', { morale: 2 }, '两面旗并排升起，城墙上的人第一次觉得自己不是孤军。', {
    special: 'transfer',
  }),
  factionCard('F-04', '密约的情报', { supply: 2, morale: 1 }, '在烛火下交换的名单与地图，让双方都少走一段弯路。', {
    special: 'transfer',
  }),
  factionCard('F-05', '战线的推进', {}, '盟军把战线向前推了一格，阿喃那的阴影也随之近了一格。', {
    progress: 1,
  }),
  factionCard('F-06', '背誓的筹码', { manpower: 2 }, '有人把旧日的誓言摆上桌，换回壮丁，也换走了同伴的一点信任。', {
    special: 'exchange',
  }),
  factionCard('F-07', '同盟的誓言', { morale: 3 }, '刀锋相抵，誓言重新刻进石墙；没有同盟，这句话什么都不是。', {
    requiresAlly: true,
  }),
  factionCard('F-08', '共同的胜利', { morale: 2, supply: 1 }, '胜利的名单上写着两个名字，粮袋上也是。', {
    requiresAlly: true,
    special: 'transfer',
  }),
]

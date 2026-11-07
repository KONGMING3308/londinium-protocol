/** 中立公共行动牌：12 张，六轴各 2 张；全部按概率结算，成功才拿原效果（含 special），失败只损 1 点补给或士气；G-12 需同盟支持 */
import { actionCard } from './helper'

export const GENERIC_CARDS = [
  actionCard('GENERIC', 'G-01', '开斯特的订单', 'logistics', {}, '开斯特公爵的军械订单，谁付钱都能签。', {
    cost: { morale: 1 },
    roll: { chance: 0.7, win: { supply: 4 }, lose: { supply: -1 } },
  }),
  actionCard('GENERIC', 'G-02', '威灵顿的舰队', 'assault', {}, '公爵的舰队出现在地平线上，很难判断它站在哪一边。', {
    cost: { manpower: 1 },
    roll: { chance: 0.65, win: { manpower: 3, morale: 1 }, lose: { supply: -1 } },
  }),
  actionCard('GENERIC', 'G-03', '温德米尔骑士', 'propaganda', {}, '温德米尔家的骑士愿意为任何一位守序者效力。', {
    cost: { supply: 1 },
    roll: { chance: 0.6, win: { manpower: 2, morale: 2 }, lose: { morale: -1 } },
  }),
  actionCard('GENERIC', 'G-04', '巫妖的观望', 'intel', {}, '埃芒加德提供一次不痛不痒、但极其可靠的保护。', {
    cost: { morale: 1 },
    special: 'immunity',
    roll: { chance: 0.55, win: { supply: 2 }, lose: { supply: -1 } },
  }),
  actionCard('GENERIC', 'G-05', '疤痕商场的买卖', 'convert', {}, '疤痕商场只认价钱，不认阵营。', {
    cost: { morale: 2 },
    roll: { chance: 0.7, win: { supply: 4 }, lose: { supply: -1 } },
  }),
  actionCard('GENERIC', 'G-06', '黑钢的佣兵', 'gamble', {}, '黑钢的合同可以替任何人挡一颗子弹，也可能只是骗钱。', {
    roll: { chance: 0.45, win: { manpower: 4 }, lose: { supply: -1 } },
  }),
  actionCard('GENERIC', 'G-07', '死魂灵的低语', 'gamble', {}, '九千年的怨念愿意透露一点敌人的秘密，也可能拖垮心智。', {
    roll: { chance: 0.6, win: { supply: 2, morale: 1 }, lose: { morale: -1 } },
  }),
  actionCard('GENERIC', 'G-08', '变形者的面具', 'convert', {}, '变形者替你演一场戏，让一次针对落空，但戏未必演得成。', {
    cost: { supply: 1 },
    special: 'cancelCounter',
    roll: { chance: 0.55, win: { morale: 1 }, lose: { morale: -1 } },
  }),
  actionCard('GENERIC', 'G-09', '拉特兰的调停', 'propaganda', {}, '使徒出面调停，保护自己与盟友免于本回合的针对。', {
    cost: { supply: 1 },
    special: 'truce',
    roll: { chance: 0.6, win: { morale: 1 }, lose: { morale: -1 } },
  }),
  actionCard('GENERIC', 'G-10', '乌萨斯的走私', 'logistics', {}, '边境的走私商队能买到任何东西。', {
    cost: { morale: 1 },
    roll: { chance: 0.7, win: { supply: 2, manpower: 1 }, lose: { supply: -1 } },
  }),
  actionCard('GENERIC', 'G-11', '中立斡旋', 'intel', {}, '中立使者在两方之间传话，有同盟时再得一分信任。', {
    cost: { supply: 1 },
    special: 'coop',
    roll: { chance: 0.6, win: { morale: 2 }, lose: { morale: -1 } },
  }),
  actionCard('GENERIC', 'G-12', '中立义勇军', 'assault', {}, '义勇军替出得起价的一方打仗；没有同盟牵线的散兵，谁也不肯替他们卖命。', {
    requiresAlly: true,
    roll: { chance: 0.6, win: { manpower: 3 }, lose: { supply: -1 } },
  }),
]

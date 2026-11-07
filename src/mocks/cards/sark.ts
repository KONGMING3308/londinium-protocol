/** 萨卡兹军事委员会：10 张行动牌（六轴）+ 7 张指定牌 */
import { actionCard, designatedCard } from './helper'

const R = 'SARK' as const

export const SARK_ACTIONS = [
  actionCard(R, 'S-A1', '王庭征召', 'assault', { manpower: 5 }, '强征各王庭的青壮，队伍膨胀，人心却散了。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'S-A2', '锤砧战术', 'assault', { manpower: 3, morale: 2 }, '曼弗雷德的锤与砧碾碎防线，代价是成建制的物资。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'S-A3', '碎片大厦工程', 'logistics', { supply: 4 }, '摄政王的工程吞掉大量劳力，换来前线急需的物资。', {
    cost: { manpower: 1 },
  }),
  actionCard(R, 'S-A4', '生命脊椎补给线', 'logistics', { supply: 3, morale: 1 }, '巨兽骸骨成为补给线，物资沿着骨缝源源不断运进城里。', {
    cost: { manpower: 1 },
  }),
  actionCard(R, 'S-A5', '血魔的祭品', 'propaganda', { morale: 4 }, '鲜血王庭献上祭品，军心大振，物资在火焰中燃烧。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'S-A6', '萨卡兹众魂', 'propaganda', { manpower: 1, morale: 2 }, '死者与生者同行，谁也无法轻易击溃他们。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'S-A7', '食腐者军团', 'convert', { manpower: 3, supply: 1 }, '孽茨雷的军团开进城区，用威望换来兵源与物资。', {
    cost: { morale: 1 },
  }),
  actionCard(R, 'S-A8', '佣兵征召', 'convert', { manpower: 4, morale: 1 }, '用物资雇佣亡命之徒，价钱当场结清。', {
    cost: { supply: 2 },
  }),
  actionCard(R, 'S-A9', '死魂灵低语', 'intel', { supply: 2 }, '九千年的悲愿泄露了敌人的部署，代价是一个失眠的夜晚。', {
    cost: { morale: 1 },
    special: 'reveal',
  }),
  actionCard(R, 'S-A10', '王庭内讧', 'gamble', { morale: 3 }, '王庭争吵不休，摄政王强行压下反对的声音，代价是抽走了前线的兵。', {
    cost: { manpower: 2 },
  }),
]

export const SARK_DESIGNATED = [
  designatedCard(R, 'S-D1', '城防盘查', 1, 'sabotage', '封锁入城口，盘查每一支可疑小队，破碎潜入者的伪装。', {
    counterTag: '潜入',
    effects: { morale: 1 },
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'S-D2', '食尸鬼突袭', 2, 'strike', '食腐者军团扑向敌人的集结点，用恐惧撕开防线。', {
    effects: { morale: 1 },
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'S-D3', '典范军围城', 3, 'siege', '王庭军包围旧城，切断补给，把战争拖进消耗战。', {
    effects: { morale: 2 },
    backlash: { supply: -4 },
  }),
  designatedCard(R, 'S-D4', '飞空艇升空', 4, 'siege', '死魂灵的躯体升空，战争正式开始，威慑同时压向对手。', {
    hitText: '死魂灵压境，对手的补给线被迫收缩：目标补给 -3',
    targetRule: 'any',
    tag: '飞空艇',
    progress: 1,
    effects: { morale: 1 },
    backlash: { supply: -4 },
  }),
  designatedCard(R, 'S-D5', '生命脊椎', 5, 'siege', '巨兽骸骨成为移动补给线，军队得以持续投送。', {
    hitText: '补给线前移，把对手的补给压回城里：目标补给 -3',
    targetRule: 'any',
    tag: '生命脊椎',
    progress: 1,
    effects: { supply: 2 },
    backlash: { supply: -4 },
  }),
  designatedCard(R, 'S-D6', '十王庭总动员', 6, 'incite', '所有王庭同时动员，同时策反敌人内部的萨卡兹旧部。', {
    targetRule: 'any',
    tag: '十王庭',
    progress: 1,
    effects: { manpower: 3, morale: 1 },
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'S-D7', '接引阿喃那', 7, 'decisive', '最初的源石回应召唤，胜负押在一次正面较量上。', {
    tag: '阿喃那',
    progress: 2,
    effects: { morale: 2 },
    backlash: { morale: -3 },
  }),
]

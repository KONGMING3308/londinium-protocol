/** 市民自救军：12 张行动牌（六轴各 2 张）+ 7 张指定牌 */
import { actionCard, designatedCard } from './helper'

const R = 'SSC' as const

export const SSC_ACTIONS = [
  actionCard(R, 'C-A1', '平民志愿者', 'assault', { manpower: 3, morale: 1 }, '没有受过训练，但他们认识每一条街。', {}),
  actionCard(R, 'C-A2', '费斯特的自行炮', 'assault', { manpower: 4 }, '用废铁焊出的炮至少能响，响之前要先安抚街区。', {
    cost: { supply: 2 },
  }),
  actionCard(R, 'C-A3', '凯瑟琳的补给线', 'logistics', { supply: 4 }, '十一号军工厂的灯一直亮着，代价是工人不眠不休。', {
    cost: { morale: 1, manpower: 1 },
  }),
  actionCard(R, 'C-A4', '地下管道', 'logistics', { supply: 2 }, '旧城的管道网比地图更可靠，什么都能运，就是要有人下去抬。', {
    cost: { manpower: 1 },
  }),
  actionCard(R, 'C-A5', '地下印刷所', 'propaganda', { morale: 3 }, '传单比子弹更能让人上街。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'C-A6', '学校疏散', 'propaganda', { morale: 3 }, '把孩子送出战区，留下的人反而更能拼命。', {
    cost: { manpower: 1 },
  }),
  actionCard(R, 'C-A7', '费斯特的工坊', 'convert', { supply: 1, manpower: 1 }, '铁皮与齿轮拼出能用的东西，用声望换来工时。', {}),
  actionCard(R, 'C-A8', '邻里互助', 'convert', { morale: 2, manpower: 2 }, '一条街养活另一条街，物资在街区之间重新分配。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'C-A9', '城市记忆', 'intel', { morale: 2, manpower: 1 }, '人们记得这座城市原本的样子，也记得敌人的仓库在哪。', {
    cost: { supply: 1 },
    special: 'reveal',
  }),
  actionCard(R, 'C-A10', '诺伯特区自救', 'gamble', { morale: 2, supply: 1 }, '被抛离的城区自己撑了起来，代价是所有能干活的人都上了墙。', {
    cost: { manpower: 2 },
  }),
  actionCard(R, 'C-A11', '街角守望', 'intel', { manpower: 2, morale: 1 }, '邻居们轮流守着街口，谁来了都看得见。', {
    cost: { supply: 1 },
    special: 'immunity',
  }),
  actionCard(R, 'C-A12', '废料交易', 'gamble', { supply: 2 }, '一车废料换回整整一车零件；只是这买卖传出去，街区的名声不太好听。', {
    cost: { morale: 2 },
  }),
]

export const SSC_DESIGNATED = [
  designatedCard(R, 'C-D1', '废品回收', 1, 'raid', '挂着废品回收的招牌，把敌对势力的物资整批运走。', {
    backlash: { supply: -3 },
  }),
  designatedCard(R, 'C-D2', '情报网', 2, 'expose', '地下管网、印刷所与工人网络连成一张网，照出对手的手牌。', {
    backlash: { supply: -2 },
  }),
  designatedCard(R, 'C-D3', '工人罢工', 3, 'incite', '让敌对势力的工厂停摆，也让他们与盟友的约定作废。', {
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'C-D4', '街区自治', 4, 'strike', '街区宣布自治，把对手的动员令挡在路障之外。', {
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'C-D5', '路障防御', 5, 'sabotage', '用路障与管道拖住敌人的行动，让他们这回合的计划落空。', {
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'C-D6', '总动员', 6, 'decisive', '全城敲响警钟，与对手比一次谁能让更多人走上街头。', {
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'C-D7', '市民自救', 7, 'strike', '最后一条街仍然亮着灯，市民用行动压过对手的士气。', {
    backlash: { morale: -3 },
  }),
]

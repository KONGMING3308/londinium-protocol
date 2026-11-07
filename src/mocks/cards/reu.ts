/** 整合运动：10 张行动牌（六轴）+ 7 张指定牌 */
import { actionCard, designatedCard } from './helper'

const R = 'REU' as const

export const REU_ACTIONS = [
  actionCard(R, 'E-A1', '感染者来投', 'assault', { manpower: 3 }, '被赶出城区的人，只能来这里。', {}),
  actionCard(R, 'E-A2', '溃兵收容', 'assault', { manpower: 2, morale: 1 }, '收编溃兵能壮胆，也能带来纪律问题。', {}),
  actionCard(R, 'E-A3', '游击补给', 'logistics', { supply: 2, manpower: 1 }, '从敌人手里抢来的物资，总比施舍来得快。', {}),
  actionCard(R, 'E-A4', '工人联络', 'logistics', { supply: 2, manpower: 2 }, '工人把仓库钥匙交了出来，钥匙经了三只手才到队里。', {
    cost: { morale: 2 },
  }),
  actionCard(R, 'E-A5', '塔露拉的演讲', 'propaganda', { morale: 4, manpower: 1 }, '她的话仍然能让最疲惫的人站起来。', {
    cost: { supply: 2 },
  }),
  actionCard(R, 'E-A6', '新纲领宣讲', 'propaganda', { morale: 3 }, '不再只为感染者，而是为所有被压迫者。', {
    cost: { supply: 1 },
  }),
  actionCard(R, 'E-A7', '废作坊制药', 'convert', { supply: 2, morale: 1 }, '地下作坊压出抑制剂，用人力换物资与信任。', {}),
  actionCard(R, 'E-A8', '黑市军火', 'convert', { supply: 4 }, '枪是旧的，子弹是新的，价钱用声望来付。', {
    cost: { manpower: 2 },
  }),
  actionCard(R, 'E-A9', '工人罢工声援', 'intel', { morale: 1, supply: 1 }, '工厂停摆，城市的齿轮为之一顿，对手的调度暴露出来。', {
    special: 'reveal',
  }),
  actionCard(R, 'E-A10', '感染者互助', 'gamble', { manpower: 2, supply: 2 }, '互助网络全部开动，能给的都给了；给完之后，队伍里开始有人怀疑还能撑多久。', {
    cost: { morale: 2 },
    special: 'cancelCounter',
  }),
]

export const REU_DESIGNATED = [
  designatedCard(R, 'E-D1', '煽动罢工', 1, 'incite', '在敌对势力的工厂煽动罢工，让他们与盟友的纽带先断掉。', {
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'E-D2', '劫掠补给', 2, 'raid', '袭击军火车队，把敌人的补给变成感染者的口粮。', {
    backlash: { supply: -3 },
  }),
  designatedCard(R, 'E-D3', '宣传战', 3, 'strike', '传单与广播压过对方的宣传，士气此消彼长。', {
    backlash: { morale: -3 },
  }),
  designatedCard(R, 'E-D4', '反间', 4, 'incite', '在对方内部散布猜疑，让他们的同盟先裂开一道缝。', {
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'E-D5', '城市巷战', 5, 'siege', '把战线拖进街区，让对手的补给在巷口耗尽。', {
    backlash: { supply: -4 },
  }),
  designatedCard(R, 'E-D6', '新纲领', 6, 'incite', '跨界线的统一战线成立，从对手的阵营中拉走追随者。', {
    targetRule: 'any',
    tag: '新纲领',
    backlash: { morale: -2 },
  }),
  designatedCard(R, 'E-D7', '联合行动', 7, 'decisive', '整合运动与盟友同时压上，与对手正面比一次动员力。', {
    backlash: { morale: -3 },
  }),
]

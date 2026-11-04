/** 盟约事件：每回合公开 1 张，对所有同盟 / 无同盟者 / 撕约者生效 */
import type { PactEventDef } from '@/types'

export const PACT_EVENTS: PactEventDef[] = [
  {
    id: 'P-01',
    name: '共同防线',
    text: '盟约被摆上台面，同盟公开承诺协防，孤立者的声势被压了下去。',
    allianceEffects: { morale: 1 },
    soloEffects: { morale: -1 },
  },
  {
    id: 'P-02',
    name: '分赃不均',
    text: '战利品分配引发争吵，物资确实到手，同盟内部的信任却裂了一道缝。',
    allianceEffects: { supply: 2, morale: -1 },
    soloEffects: { supply: 1 },
  },
  {
    id: 'P-03',
    name: '联合军演',
    text: '同盟在城外举行联合军演，兵员一同上涨，粮草也一同被吃掉。',
    allianceEffects: { manpower: 3, supply: -1 },
    soloEffects: { manpower: 1 },
  },
  {
    id: 'P-04',
    name: '情报共享',
    text: '盟约双方交换了地图与名单，孤立者却因为没人可信，只能自己摸黑。',
    allianceEffects: { supply: 1 },
    soloEffects: { morale: 1 },
  },
  {
    id: 'P-05',
    name: '前线告急',
    text: '没有盟友的人只能自己扛住前线，被逼出了家底，也熬干了军心。',
    allianceEffects: { supply: -1 },
    soloEffects: { supply: 2, morale: -1 },
  },
  {
    id: 'P-06',
    name: '背叛的诱惑',
    text: '盟约在这一刻格外脆弱，撕毁它的人能拿到最大的好处。',
    allianceEffects: { manpower: 1 },
    betrayBonus: { morale: 2, supply: 1 },
  },
]

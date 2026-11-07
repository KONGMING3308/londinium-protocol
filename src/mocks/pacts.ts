/**
 * 盟约事件：三类走向，每类 2 张，共 6 张。
 *
 * 触发规则（v0.4.2，用户敲定）：
 *   1. 场上无任何盟约 → 本回合不触发盟约事件；
 *   2. 有盟约 → 50% 概率触发；
 *   3. 触发后从三类里等概率选一类，再从该类里随机抽一张：
 *      - ally-boon  ：对已缔结同盟的阵营有利，对孤立阵营有害；
 *      - solo-boon  ：对孤立阵营有利，对已缔结同盟的阵营有害；
 *      - internal   ：同盟成员之间互相有利有弊，孤立者不受牵连。
 *
 * 设计约束（与剧情事件一致）：单项幅度 ≤ 3，且每一类内部都保证
 * 「有利」和「有害」同时存在，避免事件退化成单方面白送。
 */
import type { PactEventDef } from '@/types'

export const PACT_EVENTS: PactEventDef[] = [
  /* ================= ally-boon：同盟有利、孤立有害 ================= */
  {
    id: 'P-01',
    kind: 'ally-boon',
    name: '共同防线',
    text: '盟约被摆上台面，同盟公开承诺协防，孤立者的声势被压了下去。',
    allianceEffects: { morale: 1 },
    soloEffects: { morale: -1 },
  },
  {
    id: 'P-02',
    kind: 'ally-boon',
    name: '联合军演',
    text: '同盟在城外举行联合军演，兵员一同上涨，粮草也一同被吃掉。',
    allianceEffects: { manpower: 2, supply: -1 },
    soloEffects: { manpower: -1 },
  },

  /* ================= solo-boon：孤立有利、同盟有害 ================= */
  {
    id: 'P-03',
    kind: 'solo-boon',
    name: '孤军奋起',
    text: '没有盟友的人只能自己扛住前线，反而被逼出了死战的家底，同盟却松懈下来。',
    allianceEffects: { morale: -1 },
    soloEffects: { morale: 2 },
  },
  {
    id: 'P-04',
    kind: 'solo-boon',
    name: '散兵聚粮',
    text: '散落在各处的队伍各自搜刮，孤立者凑出了粮草；绑在一起的同盟反而要互相接济。',
    allianceEffects: { supply: -1 },
    soloEffects: { supply: 2 },
  },

  /* ================= internal：同盟内部互相有利有弊（孤立者无感） ================= */
  {
    id: 'P-05',
    kind: 'internal',
    name: '分赃不均',
    text: '战利品分配引发争吵——物资确实到手，同盟内部的信任却裂了一道缝。',
    allianceEffects: { supply: 2, morale: -1 },
  },
  {
    id: 'P-06',
    kind: 'internal',
    name: '猜忌',
    text: '盟约在这一刻格外脆弱，彼此交换情报的同时又互相提防。',
    allianceEffects: { morale: 1, supply: -1 },
  },
]

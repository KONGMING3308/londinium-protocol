/**
 * 剧情事件池：7 个回合 × 3 个候选。
 *
 * 每局开局时从每个回合的 3 个候选里随机抽 1 个，组成这一局专属的「剧本线」。
 * 这样同一回合在不同局里可能发生不同的事，玩家不能靠背板过关。
 *
 * 设计约束（写新事件时必须遵守）：
 *   1. **对全场生效**：每条事件都要影响全部 6 个阵营，不能只照顾一两个；
 *   2. **有净代价**：不允许出现「所有人都纯赚」的事件，至少有一方受损；
 *   3. **幅度克制**：单项 ±1~2，总和接近 0，避免某个事件直接决定胜负；
 *   4. **叙事与数值一致**：讲的是什么事，加减就体现在哪里。
 */
import type { FactionId, StoryEventDef } from '@/types'

const F = (v: Partial<Record<FactionId, { manpower?: number; supply?: number; morale?: number }>>) =>
  ({
    SARK: v.SARK ?? {},
    VIC: v.VIC ?? {},
    RI: v.RI ?? {},
    TARA: v.TARA ?? {},
    REU: v.REU ?? {},
    SSC: v.SSC ?? {},
  }) as Record<FactionId, { manpower?: number; supply?: number; morale?: number }>

export const STORY_EVENTS: StoryEventDef[] = [
  /* ================= 第 1 回合：潜入 ================= */
  {
    id: 'E1-01',
    round: 1,
    label: '潜入',
    story: '罗德岛以废品回收企业的身份进入伦蒂尼姆，萨卡兹在每一条街口设卡盘查。',
    deltas: F({
      SARK: { morale: 1 },
      VIC: { manpower: -1 },
      RI: { supply: -1 },
      TARA: { morale: 1 },
      REU: { morale: -1 },
      SSC: { morale: 1 },
    }),
  },
  {
    id: 'E1-02',
    round: 1,
    label: '宵禁',
    story: '全城宵禁，街道被清空。萨卡兹的巡逻队拿到了补给，其他人都被困在屋里。',
    deltas: F({
      SARK: { supply: 1, morale: 1 },
      VIC: { manpower: -1 },
      RI: { manpower: -1 },
      TARA: { supply: -1 },
      REU: { supply: -1 },
      SSC: { morale: -1 },
    }),
  },
  {
    id: 'E1-03',
    round: 1,
    label: '黑市开张',
    story: '疤痕商场的门一开，谁都能买到东西——代价是城里的秩序又薄了一层。',
    deltas: F({
      SARK: { morale: -1 },
      VIC: { morale: -1 },
      RI: { supply: 1 },
      TARA: { supply: 1 },
      REU: { supply: 2 },
      SSC: { supply: 1 },
    }),
  },

  /* ================= 第 2 回合：撤离 ================= */
  {
    id: 'E2-01',
    round: 2,
    label: '撤离',
    story: '城防炮被关闭，众人乘列车撤离。市民自救军为掩护撤离付出了代价。',
    deltas: F({
      SARK: { morale: -1 },
      VIC: { manpower: 1 },
      RI: { manpower: 1 },
      TARA: { supply: 1 },
      REU: { manpower: 1 },
      SSC: { supply: -1 },
    }),
  },
  {
    id: 'E2-02',
    round: 2,
    label: '断后',
    story: '有人自愿留下断后。主力得以脱身，留下的人却把家底都填了进去。',
    deltas: F({
      SARK: { manpower: 1 },
      VIC: { manpower: 1, supply: -1 },
      RI: { morale: -1 },
      TARA: { morale: -1 },
      REU: { supply: -1 },
      SSC: { manpower: 2, morale: -1 },
    }),
  },
  {
    id: 'E2-03',
    round: 2,
    label: '列车脱轨',
    story: '撤离列车在隧道里脱轨。物资散落一地，附近的人都去捡了。',
    deltas: F({
      SARK: { supply: 1 },
      VIC: { manpower: -1 },
      RI: { supply: -2, morale: -1 },
      TARA: { supply: 1 },
      REU: { manpower: 1 },
      SSC: { manpower: 1 },
    }),
  },

  /* ================= 第 3 回合：夺剑 ================= */
  {
    id: 'E3-01',
    round: 3,
    label: '夺剑',
    story: '诸王长眠之所开启，维娜夺取国剑；阿勒黛·坎伯兰留下断后，生死未明。',
    deltas: F({
      SARK: { morale: 1 },
      VIC: { morale: -1 },
      RI: { manpower: -1 },
      TARA: { manpower: 1 },
      REU: { supply: -1 },
      SSC: {},
    }),
  },
  {
    id: 'E3-02',
    round: 3,
    label: '诸王长眠',
    story: '陵墓的机关被触发，殉葬的甲胄重新站起。守序者拿到了王权的象征，也惊动了不该惊动的东西。',
    deltas: F({
      SARK: { manpower: -1, morale: -1 },
      VIC: { manpower: -1, morale: 2 },
      RI: { supply: 1 },
      TARA: { supply: 1 },
      REU: { morale: 1 },
      SSC: { supply: -1 },
    }),
  },
  {
    id: 'E3-03',
    round: 3,
    label: '王嗣之争',
    story: '王位的合法性成了武器。塔拉人第一次公开宣称自己的继承权，城里的舆论彻底撕裂。',
    deltas: F({
      SARK: { supply: 1 },
      VIC: { supply: 1, morale: -1 },
      RI: { manpower: 1 },
      TARA: { manpower: -1, morale: 2 },
      REU: { manpower: -1 },
      SSC: { morale: 1 },
    }),
  },

  /* ================= 第 4 回合：战争爆发 ================= */
  {
    id: 'E4-01',
    round: 4,
    label: '战争爆发',
    story: '飞空艇击毁温德米尔公爵的舰队，诺伯特区被整体抛离主城，市民沦为筹码。',
    deltas: F({
      SARK: { supply: 2 },
      VIC: { supply: -2 },
      RI: { manpower: -1 },
      TARA: { manpower: 2 },
      REU: { morale: 1 },
      SSC: { supply: -2 },
    }),
  },
  {
    id: 'E4-02',
    round: 4,
    label: '诺伯特陷落',
    story: '整片城区被抛离主城，难民挤满了教堂。军阀们趁乱接管了街区，平民什么也没剩下。',
    deltas: F({
      SARK: { manpower: 1 },
      VIC: { manpower: 1 },
      RI: { supply: 1 },
      TARA: { supply: 1 },
      REU: { supply: 1 },
      SSC: { manpower: -2, morale: -1 },
    }),
  },
  {
    id: 'E4-03',
    round: 4,
    label: '飞空艇坠落',
    story: '一艘飞空艇在城区上空解体，碎片砸穿了萨卡兹的军械库。有人清理废墟，有人翻找残骸。',
    deltas: F({
      SARK: { manpower: -2, supply: -1 },
      VIC: { manpower: 1, morale: 1 },
      RI: { manpower: 1 },
      TARA: { supply: 1 },
      REU: { morale: -1 },
      SSC: { morale: 1 },
    }),
  },

  /* ================= 第 5 回合：恶兆 ================= */
  {
    id: 'E5-01',
    round: 5,
    label: '恶兆',
    story: '温德米尔公爵遇刺，血魔大君唤醒源石种子，生命脊椎成为各方争夺的补给线。',
    deltas: F({
      SARK: { morale: 2 },
      VIC: { manpower: -1 },
      RI: { morale: -1 },
      TARA: { supply: 1 },
      REU: { manpower: 1 },
      SSC: { morale: -1 },
    }),
  },
  {
    id: 'E5-02',
    round: 5,
    label: '公爵遇刺',
    story: '温德米尔公爵倒在血泊里。典范军群龙无首，各路势力开始重新盘算站队。',
    deltas: F({
      SARK: { morale: 1 },
      VIC: { supply: 1, morale: -2 },
      RI: { supply: 1 },
      TARA: { morale: 1 },
      REU: { supply: 1 },
      SSC: { manpower: -1 },
    }),
  },
  {
    id: 'E5-03',
    round: 5,
    label: '源石种子',
    story: '血魔大君唤醒了源石种子，源石技艺的共鸣让战场变得不可预测，也让某些人前所未有地强。',
    deltas: F({
      SARK: { supply: 2, morale: -1 },
      VIC: { morale: 1 },
      RI: { supply: -1 },
      TARA: { manpower: 1 },
      REU: { morale: -1 },
      SSC: { supply: -1 },
    }),
  },

  /* ================= 第 6 回合：银石崖 ================= */
  {
    id: 'E6-01',
    round: 6,
    label: '银石崖',
    story: '国剑与剑座合体劈开天灾，公爵联军与典范军反攻，罗德岛强行登舰。',
    deltas: F({
      SARK: { supply: 1 },
      VIC: { manpower: 2 },
      RI: { manpower: 1 },
      TARA: { morale: -1 },
      REU: { manpower: 1 },
      SSC: { morale: 1 },
    }),
  },
  {
    id: 'E6-02',
    round: 6,
    label: '强行登舰',
    story: '罗德岛在炮火中靠着舰体强行登舰。人上去了，补给全留在了下面。',
    deltas: F({
      SARK: { manpower: -1 },
      VIC: { manpower: 1 },
      RI: { manpower: 2, supply: -1 },
      TARA: { supply: 1 },
      REU: { morale: 1 },
      SSC: { morale: -1 },
    }),
  },
  {
    id: 'E6-03',
    round: 6,
    label: '天灾压境',
    story: '天灾云压过银石崖，所有人都得先保命。抢到的地盘没用了，能带走的才算是自己的。',
    deltas: F({
      SARK: { morale: 1, supply: -1 },
      VIC: { morale: 1, supply: -1 },
      RI: { manpower: -1 },
      TARA: { manpower: 1, supply: -1 },
      REU: { supply: -1 },
      SSC: { morale: 1, supply: -1 },
    }),
  },

  /* ================= 第 7 回合：终局 ================= */
  {
    id: 'E7-01',
    round: 7,
    label: '终局',
    story: '阿喃那降临，阿米娅自刺承冠，塔拉宣布独立。所有人的账都要在这一回合结清。',
    deltas: F({
      SARK: { morale: -2 },
      VIC: { morale: 2 },
      RI: { morale: 2 },
      TARA: { morale: 2 },
      REU: { morale: 2 },
      SSC: { morale: 1 },
    }),
  },
  {
    id: 'E7-02',
    round: 7,
    label: '阿喃那降临',
    story: '阿喃那的阴影笼罩全城。萨卡兹的信仰被推到顶点，其他所有人都在同一天里失去了什么。',
    deltas: F({
      SARK: { manpower: -1, morale: 2 },
      VIC: { morale: -1 },
      RI: { morale: 1 },
      TARA: { morale: 1 },
      REU: { morale: -1 },
      SSC: { morale: 1 },
    }),
  },
  {
    id: 'E7-03',
    round: 7,
    label: '塔拉独立',
    story: '塔拉在废墟上宣布独立，旗帜插上城头。有人终于等到了这一天，有人失去了全部筹码。',
    deltas: F({
      SARK: { morale: -1 },
      VIC: { morale: -2 },
      RI: { morale: 1 },
      TARA: { supply: -1, morale: 3 },
      REU: { supply: 1 },
      SSC: { morale: 1 },
    }),
  },
]

/** 某一回合的候选池 */
export function storyCandidates(round: number): StoryEventDef[] {
  return STORY_EVENTS.filter((e) => e.round === round)
}

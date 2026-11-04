/** 七回合剧情修正：固定剧本层 */
import type { RoundModifier } from '@/types'

export const ROUND_MODIFIERS: RoundModifier[] = [
  {
    round: 1,
    label: '潜入',
    story: '罗德岛以废品回收企业的身份进入伦蒂尼姆，萨卡兹在每一条街口设卡盘查。',
    deltas: {
      SARK: { morale: 1 },
      VIC: { manpower: -1 },
      RI: { supply: -1 },
      TARA: { morale: 1 },
      REU: { morale: -1 },
      SSC: { morale: 1 },
    },
  },
  {
    round: 2,
    label: '撤离',
    story: '城防炮被关闭，众人乘列车撤离。市民自救军为掩护撤离付出了代价。',
    deltas: {
      SARK: { morale: -1 },
      VIC: { manpower: 1 },
      RI: { manpower: 1 },
      TARA: { supply: 1 },
      REU: { manpower: 1 },
      SSC: { supply: -1 },
    },
  },
  {
    round: 3,
    label: '夺剑',
    story: '诸王长眠之所开启，维娜夺取国剑；阿勒黛·坎伯兰留下断后，生死未明。',
    deltas: {
      SARK: { morale: 1 },
      VIC: { morale: -1 },
      RI: { manpower: -1 },
      TARA: { manpower: 1 },
      REU: { supply: -1 },
      SSC: {},
    },
  },
  {
    round: 4,
    label: '战争爆发',
    story: '飞空艇击毁温德米尔公爵的舰队，诺伯特区被整体抛离主城，市民沦为筹码。',
    deltas: {
      SARK: { supply: 2 },
      VIC: { supply: -2 },
      RI: { manpower: -1 },
      TARA: { manpower: 2 },
      REU: { morale: 1 },
      SSC: { supply: -2 },
    },
  },
  {
    round: 5,
    label: '恶兆',
    story: '温德米尔公爵遇刺，血魔大君唤醒源石种子，生命脊椎成为各方争夺的补给线。',
    deltas: {
      SARK: { morale: 2 },
      VIC: { manpower: -1 },
      RI: { morale: -1 },
      TARA: { supply: 1 },
      REU: { manpower: 1 },
      SSC: { morale: -1 },
    },
  },
  {
    round: 6,
    label: '银石崖',
    story: '国剑与剑座合体劈开天灾，公爵联军与典范军反攻，罗德岛强行登舰。',
    deltas: {
      SARK: { supply: 1 },
      VIC: { manpower: 2 },
      RI: { manpower: 1 },
      TARA: { morale: -1 },
      REU: { manpower: 1 },
      SSC: { morale: 1 },
    },
  },
  {
    round: 7,
    label: '终局',
    story: '阿喃那降临，阿米娅自刺承冠，塔拉宣布独立。所有人的账都要在这一回合结清。',
    deltas: {
      SARK: { morale: -2 },
      VIC: { morale: 2 },
      RI: { morale: 2 },
      TARA: { morale: 2 },
      REU: { morale: 2 },
      SSC: { morale: 1 },
    },
  },
]

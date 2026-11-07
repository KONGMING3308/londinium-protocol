/**
 * 回合主题：七回合各自的「大背景」。
 *
 * 这里**只有名字，没有数值**。
 *
 * v0.3.0 之前这个文件叫「剧情修正」，每回合固定给各阵营加减数值。
 * 问题是七回合跑完就是一套写死的剧本，打两局所有玩家都能背下来，
 * 所谓「剧情」退化成了纯数值噪声 —— 玩家看见 R3 就知道萨卡兹士气 +1，
 * 既不意外也没有决策空间。
 *
 * 现在数值部分改成「每回合从 3 个候选事件里随机抽 1 个」（见 src/mocks/story.ts
 * 与 src/utils/game/story.ts），所以固定数值表已经没有存在意义，删掉。
 * 但「回合主题名」（潜入 / 撤离 / 夺剑 …）仍然有用：
 * 它是时间轴上的锚点，让玩家知道这一回合在整场战争里处于哪个阶段。
 */
export interface RoundTheme {
  round: number
  label: string
}

export const ROUND_THEMES: RoundTheme[] = [
  { round: 1, label: '潜入' },
  { round: 2, label: '撤离' },
  { round: 3, label: '夺剑' },
  { round: 4, label: '战争爆发' },
  { round: 5, label: '恶兆' },
  { round: 6, label: '银石崖' },
  { round: 7, label: '终局' },
]

export function getRoundTheme(round: number): RoundTheme {
  return ROUND_THEMES.find((t) => t.round === round) ?? ROUND_THEMES[0]
}

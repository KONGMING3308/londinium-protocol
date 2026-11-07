/**
 * 中立资源点：每回合刷出若干个，四人**竞标争夺**。
 *
 * 设计动机（v0.3.0 之前的中立援助为什么不够）
 * ------------------------------------------------
 * 原来的中立援助是「人手一张、各抽各的、各自掷骰」，
 * 四个人之间零交互——本质上是并行的单人骰子游戏。
 * 改成竞标之后：
 *   - 你要判断别人会不会抢、愿意出多少（信息不对称）；
 *   - 出价最高者独得，其余人的出价全部打水漂；
 *   - 出价从行动牌资源里挤出来，形成「抢资源 vs 保战力」的取舍。
 *
 * 平衡约束（新增资源点时必须遵守）
 * ------------------------------------------------
 *   1. 奖励不能超过行动牌的正向收益（否则抢点成为唯一最优解）；
 *   2. minBid 必须有实感，否则「出 1 点碰运气」变成无成本摸奖；
 *   3. 同一回合刷出的点要覆盖不同取向（一个偏补给、一个偏士气），
 *      让不同阵营根据自己的短板做不同选择。
 */
import type { NeutralPointDef } from '@/types'

export const NEUTRAL_POINTS: NeutralPointDef[] = [
  {
    id: 'N-01',
    name: '疤痕商场的军械',
    reward: { supply: 4 },
    flavor: '成箱的军械堆在仓库里，只认价钱不认人。',
    minBid: 2,
  },
  {
    id: 'N-02',
    name: '生命脊椎的补给线',
    reward: { supply: 2, manpower: 2 },
    flavor: '一条还通着的补给线，谁占住谁就能喘口气。',
    minBid: 1,
  },
  {
    id: 'N-03',
    name: '城头的广播站',
    reward: { morale: 4 },
    flavor: '只要站上那个台子，全城都得听你说话。',
    minBid: 2,
  },
  {
    id: 'N-04',
    name: '黑钢的雇佣合同',
    reward: { manpower: 4 },
    flavor: '黑钢只问一句：钱呢。',
    minBid: 2,
  },
  {
    id: 'N-05',
    name: '废品回收站的残骸',
    reward: { supply: 3 },
    flavor: '一堆没人要的废铁，懂行的能从中拆出好东西。',
    minBid: 1,
  },
  {
    id: 'N-06',
    name: '教堂的救济点',
    reward: { morale: 2, manpower: 1 },
    flavor: '难民挤在教堂里，谁能给他们一口饭，谁就有名声。',
    minBid: 1,
  },
  {
    id: 'N-07',
    name: '诺伯特区的制高点',
    reward: { morale: 2, supply: 1 },
    flavor: '站得高看得远，也方便把东西往下扔。',
    minBid: 2,
  },
  {
    id: 'N-08',
    name: '巫妖的藏书',
    reward: { morale: 3, supply: 1 },
    flavor: '九千年的知识，标价不高，但没人敢欠埃芒加德的人情。',
    minBid: 2,
  },
  {
    id: 'N-09',
    name: '拉特兰的调停席',
    reward: { morale: 2 },
    flavor: '一张桌子，四把椅子。谁坐上主位，谁就掌握了话语权。',
    minBid: 2,
  },
  {
    id: 'N-10',
    name: '走私商队',
    reward: { supply: 2, morale: 1 },
    flavor: '商队的路线只有他们自己知道，跟上去的人能分一杯。',
    minBid: 1,
  },
]

/**
 * 洗牌后取前 n 个作为本回合的资源点。
 * 传入 random 便于测试固定结果。
 */
export function drawNeutralPoints(
  round: number,
  count: number,
  random: () => number = Math.random,
): NeutralPointDef[] {
  // 真正的 Fisher-Yates 洗牌后取前 n 个。
  // 之前的「旋转」实现会让固定相邻组合永远同现（某两个点永远是邻居），
  // 洗牌才能让任意组合都有机会，避免配对僵化。
  const pool = [...NEUTRAL_POINTS]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picked = pool.slice(0, Math.min(count, pool.length))
  // 资源点 id 加上回合与序号前缀，便于日志与测试区分「哪一回合的哪个点」
  return picked.map((p, i) => ({ ...p, id: `R${round}-${p.id}-${i}` }))
}

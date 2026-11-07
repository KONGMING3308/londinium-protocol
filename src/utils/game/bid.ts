/**
 * 中立资源竞标：每回合刷出若干资源点，四人在暗选时秘密出价争夺。
 *
 * 为什么要有这一层（v0.3.0 的中立援助为什么不够）
 * ------------------------------------------------
 * 原来的中立援助是「人手一张、各抽各的、各自掷骰」，四个人之间零交互，
 * 本质上是并行的单人骰子游戏 —— 没有读人、没有博弈、没有「抢」。
 * 竞标把这一块补成真正的 PVP：
 *   - 出价保密 → 要猜别人会不会抢、愿意出多少；
 *   - 最高价独得、其余出价不退 → 不是无成本摸奖，得有取舍；
 *   - 出价从补给里扣 → 「抢资源」和「保战力」直接冲突，必须二选一。
 *
 * 一条关键规则：**并列最高价 = 流拍**。
 * 否则「大家都出 1 点」会变成四个人平分的无风险彩票，抢的紧张感就没了。
 * 流拍时所有人的出价照扣 —— 猜错方向是要付学费的。
 */
import type { Bid, BidResult, NeutralPointDef, PlayerState, Stats } from '@/types'

const STAT_NAME: Record<keyof Stats, string> = {
  manpower: '人力',
  supply: '补给',
  morale: '士气',
}

/** 把奖励渲染成一句人话，如「补给 +4」 */
export function describeReward(reward: Partial<Stats>): string {
  return (Object.keys(reward) as (keyof Stats)[])
    .filter((k) => (reward[k] ?? 0) !== 0)
    .map((k) => `${STAT_NAME[k]} ${(reward[k] ?? 0) > 0 ? '+' : ''}${reward[k]}`)
    .join('、')
}

export interface BidInput {
  /** 出价指向的资源点 id；null = 不参与本回合争夺 */
  pointId: string | null
  amount: number
}

/**
 * 校验一次出价，返回错误信息（合法时返回 null）。
 *
 * 规则：
 *   - 不参与争夺 → pointId 为 null，此时 amount 必须为 0；
 *   - 参与争夺 → 资源点必须存在，出价必须 ≥ 该点的 minBid；
 *   - 出价必须是整数且 ≥ 0（防止 0.5、NaN 这类脏数据）。
 *
 * 刻意**不校验**「出价是否超过自己的补给」：允许透支出价是设计的一部分，
 * 透支的风险由玩家自己承担（结算层会因此更容易崩溃），引擎不代劳。
 */
export function validateBid(
  points: NeutralPointDef[],
  bid: BidInput | null | undefined,
): string | null {
  if (!bid) return null
  if (!Number.isInteger(bid.amount) || bid.amount < 0) return '出价必须是非负整数。'
  if (bid.pointId === null) {
    if (bid.amount !== 0) return '不参与争夺时出价必须为 0。'
    return null
  }
  const point = points.find((p) => p.id === bid.pointId)
  if (!point) return '所选的中立资源点不存在。'
  // 指向某点却出 0 元：视为「不参与」，是合法输入。
  // 是否把它计入出价表由调用方决定（引擎层会把它规范化为 null，不计入 bidCount）。
  if (bid.amount === 0) return null
  if (bid.amount < point.minBid) return `「${point.name}」的最低出价是 ${point.minBid}。`
  return null
}

/**
 * 结算本回合所有资源点的竞标。
 *
 * 对每个资源点：
 *   1. 收集所有指向它的有效出价（amount ≥ minBid）；
 *   2. 找最高价持有者；
 *   3. 最高价只有一个人 → 那人独得奖励，并扣掉出价；
 *   4. 最高价并列 → 流拍，无人得奖，但**所有人的出价照扣**；
 *   5. 无人有效出价 → 流拍，不扣任何人的钱（本来就没出价）。
 *
 * 注意扣钱这一步：所有「出过价的人」都要扣，不只是赢家。
 * 这才是竞标的核心张力 —— 输了也要付钱。
 */
export function resolveBids(
  players: PlayerState[],
  points: NeutralPointDef[],
  bids: Record<string, Bid>,
  round: number,
): { players: PlayerState[]; results: BidResult[]; logs: string[] } {
  const results: BidResult[] = []
  const logs: string[] = []
  // 先按玩家算出「每个资源点要扣多少」，最后统一落账，避免边算边改
  const deduction = new Map<string, number>()
  const reward = new Map<string, Partial<Stats>>()
  const live = players.filter((p) => !p.defeated)

  points.forEach((point) => {
    const entries = live
      .map((p) => {
        const b = bids[p.id]
        if (!b || b.pointId !== point.id) return null
        if (!Number.isInteger(b.amount) || b.amount < point.minBid) return null
        return { playerId: p.id, name: p.name, amount: b.amount }
      })
      .filter((x): x is { playerId: string; name: string; amount: number } => x !== null)

    if (entries.length === 0) {
      results.push({
        pointId: point.id,
        pointName: point.name,
        winnerId: null,
        winnerName: '',
        winningBid: 0,
        tied: false,
        bids: [],
      })
      logs.push(`【${point.name}】没有人出价，流拍。`)
      return
    }

    // 所有出价都要扣钱（不论是赢是输）——这是竞标的核心张力
    entries.forEach((e) => {
      deduction.set(e.playerId, (deduction.get(e.playerId) ?? 0) + e.amount)
    })

    const top = Math.max(...entries.map((e) => e.amount))
    const topEntries = entries.filter((e) => e.amount === top)
    const tied = topEntries.length > 1
    const winner = tied ? null : topEntries[0]

    if (winner) {
      reward.set(winner.playerId, point.reward)
      results.push({
        pointId: point.id,
        pointName: point.name,
        winnerId: winner.playerId,
        winnerName: winner.name,
        winningBid: top,
        tied: false,
        bids: entries,
      })
      logs.push(
        `【${point.name}】${winner.name} 以 ${top} 补给夺得（${describeReward(point.reward)}）。其余 ${entries.length - 1} 人的出价不予退还。`,
      )
    } else {
      results.push({
        pointId: point.id,
        pointName: point.name,
        winnerId: null,
        winnerName: '',
        winningBid: top,
        tied: true,
        bids: entries,
      })
      logs.push(
        `【${point.name}】${topEntries.length} 人并列出价 ${top}，流拍 —— 谁的出价都不退。`,
      )
    }
  })

  void round

  const next = players.map((p) => {
    let cost = deduction.get(p.id) ?? 0
    // B7：低补给保护——扣费前补给不足 5 的阵营，竞标扣费减半（向下取整，至少 1）。
    // 否则「抢点 + 被夺补给」会把薄底阵营在第一回合就压崩溃（实录中的 SSC 即是如此）。
    if (cost > 0 && p.stats.supply < 5) {
      cost = Math.max(1, Math.floor(cost / 2))
    }
    const gain = reward.get(p.id)
    if (cost === 0 && !gain) return p
    const stats: Stats = {
      manpower: p.stats.manpower + (gain?.manpower ?? 0),
      supply: p.stats.supply - cost + (gain?.supply ?? 0),
      morale: p.stats.morale + (gain?.morale ?? 0),
    }
    return { ...p, stats }
  })

  return { players: next, results, logs }
}

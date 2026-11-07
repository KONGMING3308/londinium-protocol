/**
 * 剧情事件：每回合从该回合的候选池里随机抽 1 个，对全场生效。
 *
 * 与 v0.3.0 之前的区别
 * --------------------
 * 之前是「第 N 回合固定用第 N 条」，七回合跑完就是一个写死的剧本，
 * 打两局之后玩家就能背下来，剧情退化成纯数值噪声。
 * 现在每个回合有 3 个候选，每局随机抽 1 个 —— 同一回合在不同局里
 * 可能发生完全不同的事，玩家必须临场判断「这回合对谁有利」。
 */
import { FACTION_MAP } from '@/mocks/factions'
import { storyCandidates } from '@/mocks/story'
import type { FactionId, PlayerState, StoryEventDef } from '@/types'

/**
 * 从某回合的候选池里随机抽 1 个事件。
 * 池子为空时返回 null（例如扩展出第 8 回合但没写事件），调用方需容错。
 */
export function pickStoryEvent(
  round: number,
  random: () => number = Math.random,
): StoryEventDef | null {
  const pool = storyCandidates(round)
  if (pool.length === 0) return null
  // random() 理论上恒 < 1，取模是为了防御注入的 random 返回边界值
  const idx = Math.floor(random() * pool.length)
  return pool[Math.min(Math.max(idx, 0), pool.length - 1)]
}

/**
 * 把事件对全场的影响加到玩家数值上。
 *
 * 注意：这里只做加法，截断交给调用方的 clampToCap 统一处理，
 * 避免出现「事件里自己截断一次、外层又截断一次」的双重口径。
 */
export function applyStoryEvent(players: PlayerState[], event: StoryEventDef | null): PlayerState[] {
  if (!event) return players
  return players.map((p) => {
    const d = event.deltas[p.factionId] ?? {}
    return {
      ...p,
      stats: {
        manpower: p.stats.manpower + (d.manpower ?? 0),
        supply: p.stats.supply + (d.supply ?? 0),
        morale: p.stats.morale + (d.morale ?? 0),
      },
    }
  })
}

const STAT_NAME: Record<string, string> = {
  manpower: '人力',
  supply: '补给',
  morale: '士气',
}

/** 把事件影响渲染成一句人话，用于日志与界面 */
export function describeStoryEvent(event: StoryEventDef): string {
  const parts: string[] = []
  ;(Object.keys(event.deltas) as FactionId[]).forEach((fid) => {
    const d = event.deltas[fid] ?? {}
    const seg = (Object.keys(d) as ('manpower' | 'supply' | 'morale')[])
      .filter((k) => (d[k] ?? 0) !== 0)
      .map((k) => `${STAT_NAME[k]}${(d[k] ?? 0) > 0 ? '+' : ''}${d[k]}`)
    // 阵营名唯一权威来源是 FACTION_MAP，绝不再手写第二份（历史上这里把
    // 典范军写成「维多利亚」、整合运动写成「雷姆必拓」、市民自救军写成「叙拉古」）
    if (seg.length > 0) parts.push(`${FACTION_MAP[fid]?.name ?? fid} ${seg.join(' ')}`)
  })
  return parts.join('，')
}

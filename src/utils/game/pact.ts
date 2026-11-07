/**
 * 盟约事件的抽取与展示：
 * - pickPactEvent：按「无盟约不触发 → 有盟约 50% 触发 → 三类里随机选一类再抽一张」抽事件；
 * - describePactEvent：把 allianceEffects / soloEffects 翻译成一句带数值的人话。
 *
 * 背景：历史上盟约事件每回合必定触发、且只写叙事不写数值，
 * 玩家看到「盟约事件【共同防线】：盟约被摆上台面…」却不知道谁 +1、谁 -1，
 * 等于「触发了但不知道触发了个啥」。而且「永远对盟约有利」让不结盟的一方
 * 每回合都在吃亏，于是改为三类随机 + 概率触发，见 v0.4.2 规则。
 */
import { PACT_EVENTS } from '@/mocks/pacts'
import type { PactEventDef, PactEventKind, PlayerState } from '@/types'

const STAT_NAME: Record<string, string> = {
  manpower: '人力',
  supply: '补给',
  morale: '士气',
}

/** 三类走向，与 PactEventKind 对应；触发后等概率选一类 */
const KINDS: PactEventKind[] = ['ally-boon', 'solo-boon', 'internal']

/** 判断两个玩家是否「互为盟友」——同盟破裂判定只承认双重互指 */
function isMutualAlly(a: PlayerState, b: PlayerState): boolean {
  return a.allyId === b.id && b.allyId === a.id
}

/**
 * 场上是否存在至少一对「互为盟友」的同盟。
 * 只认双重互指（A→B 且 B→A），单边残留的 allyId 不算数。
 */
export function hasAnyAlliance(players: PlayerState[]): boolean {
  const alive = players.filter((p) => !p.defeated)
  for (let i = 0; i < alive.length; i += 1) {
    for (let j = i + 1; j < alive.length; j += 1) {
      if (isMutualAlly(alive[i], alive[j])) return true
    }
  }
  return false
}

/**
 * 抽取本回合的盟约事件。
 *
 * 规则（v0.4.2）：
 *   1. 场上无任何盟约 → 返回 null（不触发）；
 *   2. 有盟约 → 50% 概率触发，否则返回 null；
 *   3. 触发后从三类走向里等概率选一类，再从该类里随机抽一张。
 *
 * @param players 当前玩家列表（用于判断是否有人结盟）
 * @param random  可注入的随机数源（默认 Math.random），便于测试
 */
export function pickPactEvent(
  players: PlayerState[],
  random: () => number = Math.random,
): PactEventDef | null {
  if (!hasAnyAlliance(players)) return null
  // 50% 概率：random() < 0.5 触发，>= 0.5 不触发
  if (random() >= 0.5) return null
  // 三类里等概率选一类
  const kind = KINDS[Math.min(KINDS.length - 1, Math.max(0, Math.floor(random() * KINDS.length)))]
  const pool = PACT_EVENTS.filter((e) => e.kind === kind)
  if (pool.length === 0) return null
  const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))
  return pool[idx]
}

function seg(delta: Record<string, number | undefined> | undefined): string {
  if (!delta) return ''
  const parts = (['manpower', 'supply', 'morale'] as const)
    .filter((k) => (delta[k] ?? 0) !== 0)
    .map((k) => `${STAT_NAME[k]}${(delta[k] ?? 0) > 0 ? '+' : ''}${delta[k]}`)
  return parts.join(' ')
}

/** 返回「同盟双方 士气+1；无同盟者 士气-1」这种完整描述，无效果的分支省略 */
export function describePactEvent(pact: PactEventDef): string {
  const parts: string[] = []
  const alliance = seg(pact.allianceEffects)
  const solo = seg(pact.soloEffects)
  if (alliance) parts.push(`同盟双方 ${alliance}`)
  if (solo) parts.push(`无同盟者 ${solo}`)
  return parts.join('；') || '无数值影响'
}

/** 回合结算：代价 → 指定牌 → 行动牌 → 盟约事件 → 同盟互援 → 上限/流亡 */
import { HOSTILE_PAIRS } from '@/mocks/factions'
import type { CardDef, LogEntry, PactEventDef, Pick, PlayerState, Stats } from '@/types'

export const STAT_CAP = 50
export const EXILE_CAP = 12
export const STAT_KEYS = ['manpower', 'supply', 'morale'] as const

const DEFENSE: string[] = ['immunity', 'cancelCounter', 'redirect']

export function isHostile(a: string, b: string): boolean {
  return HOSTILE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

function addStats(base: Stats, delta: Partial<Stats>): Stats {
  const next = { ...base }
  STAT_KEYS.forEach((k) => {
    const v = delta[k]
    if (v) next[k] += v
  })
  return next
}

function applyDelta(p: PlayerState, delta: Partial<Stats>): void {
  p.stats = addStats(p.stats, delta)
}

/** A-04：流亡只减免带 KEY 标签的牌的正向收益，普通收益照常结算 */
function applyCardDelta(p: PlayerState, delta: Partial<Stats> | undefined, card: CardDef | null): void {
  if (!delta) return
  if (!(p.exiled && card?.tag)) {
    applyDelta(p, delta)
    return
  }
  const scaled: Partial<Stats> = {}
  STAT_KEYS.forEach((k) => {
    const v = delta[k]
    if (v) scaled[k] = v > 0 ? Math.max(1, Math.floor(v / 2)) : v
  })
  applyDelta(p, scaled)
}

function payCost(p: PlayerState, cost?: Partial<Stats>): void {
  if (!cost) return
  STAT_KEYS.forEach((k) => {
    const v = cost[k]
    if (v) p.stats[k] -= v
  })
}

function effectSummary(delta: Partial<Stats>): string {
  const label: Record<keyof Stats, string> = { manpower: '人力', supply: '补给', morale: '士气' }
  const parts = STAT_KEYS.filter((k) => delta[k]).map(
    (k) => `${label[k]}${delta[k]! > 0 ? '+' : ''}${delta[k]}`,
  )
  return parts.length > 0 ? parts.join('、') : '无'
}

function playedCards(pick: Pick | undefined): CardDef[] {
  if (!pick) return []
  return pick.designated ? [...pick.cards, pick.designated] : [...pick.cards]
}

/** 可选目标：优先敌对阵营；若没有敌对对手则退化为任意对手，保证指定牌始终可玩 */
export function validTargets(
  attacker: PlayerState,
  players: PlayerState[],
  rule: 'hostile' | 'any' = 'hostile',
): PlayerState[] {
  const others = players.filter((p) => p.id !== attacker.id && !p.defeated)
  if (rule === 'any') return others
  const hostile = others.filter((p) => isHostile(attacker.factionId, p.factionId))
  return hostile.length > 0 ? hostile : others
}

function findTarget(
  attacker: PlayerState,
  players: PlayerState[],
  targetId: string | null,
  rule: 'hostile' | 'any' = 'hostile',
): PlayerState | null {
  if (!targetId) return null
  return validTargets(attacker, players, rule).find((p) => p.id === targetId) ?? null
}

interface Attempt {
  attacker: PlayerState
  card: CardDef
  target: PlayerState | null
  status: 'ok' | 'blocked' | 'miss' | 'mediated'
  reason: string
}

export interface ResolveResult {
  players: PlayerState[]
  logs: LogEntry[]
}

/** 阵营牌结算：下一回合开始前生效，优先级高于剧情修正 */
export function applyFactionCards(
  players: PlayerState[],
  pending: Record<string, CardDef>,
): { players: PlayerState[]; logs: LogEntry[] } {
  const logs: LogEntry[] = []
  const next = players.map((p) => ({
    ...p,
    stats: { ...p.stats },
    nullifiedTags: [...p.nullifiedTags],
  }))
  const byId = new Map(next.map((p) => [p.id, p]))

  next.forEach((p) => {
    const card = pending[p.id]
    if (!card) return
    if (card.requiresAlly && !p.allyId) {
      logs.push({
        round: 0,
        tone: 'info',
        text: `${p.name} 的阵营牌「${card.name}」失去同盟，未能生效。`,
      })
      return
    }
    const ally = p.allyId ? byId.get(p.allyId) : undefined
    applyCardDelta(p, card.effects, card)
    if (card.special === 'transfer' && ally) applyCardDelta(ally, card.effects, card)
    if (card.special === 'exchange' && ally) ally.stats.morale -= 1
    if (card.progress) p.warProgress += card.progress

    const parts: string[] = []
    const own = effectSummary(card.effects)
    if (own !== '无') parts.push(`自身 ${own}`)
    if (card.special === 'transfer' && ally) parts.push(`盟友 ${ally.name} 同享`)
    if (card.special === 'exchange' && ally) parts.push(`盟友 ${ally.name} 士气 -1`)
    if (card.progress) parts.push(`战争进度 +${card.progress}`)
    logs.push({
      round: 0,
      tone: 'good',
      text: `${p.name} 的阵营牌「${card.name}」生效：${parts.join('，') || '无'}。`,
    })
  })

  return { players: next, logs }
}

/** 有 roll 的牌需要预掷成功才算拥有该 special；无 roll 视为成功 */
function isWin(card: CardDef, rolls: Map<string, boolean>): boolean {
  return card.roll ? rolls.get(card.id) === true : true
}

/** 行动牌 special 的公共执行逻辑，roll 成功后才调用 */
function runSpecial(
  p: PlayerState,
  card: CardDef,
  players: PlayerState[],
  logs: LogEntry[],
  round: number,
): void {
  if (card.special === 'stealSupply') {
    const victim = players
      .filter((o) => o.id !== p.id && !o.defeated && isHostile(o.factionId, p.factionId))
      .sort((a, b) => b.stats.supply - a.stats.supply)[0]
    if (victim && victim.stats.supply > 0) {
      victim.stats.supply -= 1
      p.stats.supply += 1
      logs.push({ round, tone: 'bad', text: `${p.name} 的「${card.name}」夺走了 ${victim.name} 的补给。` })
    }
  }
  if (card.special === 'buyManpower' && p.stats.supply >= 1) {
    p.stats.supply -= 1
    p.stats.manpower += 1
  }
  if (card.special === 'coop' && p.allyId) p.stats.morale += 1
  if (card.special === 'reveal') {
    const richest = players
      .filter((o) => !o.defeated)
      .sort((a, b) => b.warProgress - a.warProgress)[0]
    if (richest) {
      logs.push({
        round,
        tone: 'info',
        text: `${p.name} 的「${card.name}」情报：战争进度最高的是 ${richest.name}（${richest.warProgress}）。`,
      })
    }
  }
  if (card.special === 'revive' && p.exiled) {
    p.stats = { manpower: 8, supply: 8, morale: 8 }
    p.exiled = false
    logs.push({ round, tone: 'good', text: `${p.name} 借术式解除流亡，重返战场。` })
  }
}

export function resolveRound(
  players: PlayerState[],
  picks: Record<string, Pick>,
  round: number,
  pact: PactEventDef | null,
): ResolveResult {
  const logs: LogEntry[] = []
  const next = players.map((p) => ({
    ...p,
    stats: { ...p.stats },
    nullifiedTags: [...p.nullifiedTags],
  }))
  const byId = new Map(next.map((p) => [p.id, p]))
  const nullified = new Set<string>()
  /** 已击穿 KEY 标签的指定牌 id，避免与 sabotage 的基础收益重复计数 */
  const pierced = new Set<string>()
  /** 针对标签落空的指定牌 id：只摸到补给，不再结算 op 收益 */
  const whiffed = new Set<string>()
  /** 统一预掷：success 才拥有 roll 牌的效果与 special */
  const rolls = new Map<string, boolean>()
  next.forEach((p) => {
    ;(picks[p.id]?.cards ?? []).forEach((c) => {
      if (c.roll) rolls.set(c.id, Math.random() < c.roll.chance)
    })
  })

  const truceLine = next
    .filter((p) => !p.defeated)
    .map((p) => ({ player: p, cards: playedCards(picks[p.id]) }))
    .filter((row) => row.cards.some((c) => c.special === 'truce' && isWin(c, rolls)))

  // 调停只保护打出者本人与其盟友，不再让全场指定牌作废
  const mediated = new Set<string>()
  truceLine.forEach((row) => {
    mediated.add(row.player.id)
    if (row.player.allyId) mediated.add(row.player.allyId)
  })
  if (mediated.size > 0) {
    const names = next.filter((p) => mediated.has(p.id)).map((p) => p.name).join('、')
    logs.push({
      round,
      tone: 'info',
      text: `拉特兰的调停生效：${names} 受到庇护，本回合不能被指定牌针对。`,
    })
  }

  // 1. 行动牌代价先行扣除（出局者不再参与本回合）
  next.forEach((p) => {
    if (p.defeated) return
    ;(picks[p.id]?.cards ?? []).forEach((c) => payCost(p, c.cost))
  })

  // 2. 指定牌：确定目标与防御结果
  const attempts: Attempt[] = []
  next.forEach((attacker) => {
    const card = picks[attacker.id]?.designated
    if (!card || attacker.defeated) return
    if (attacker.exiled) {
      logs.push({
        round,
        tone: 'info',
        text: `${attacker.name} 处于流亡，无法主动针对他人，「${card.name}」未生效。`,
      })
      return
    }
    // 指定牌统一可指向任意对手（含盟友），不再受 targetRule 限制
    const target = findTarget(attacker, next, picks[attacker.id]?.targetId ?? null, 'any')
    if (!target) {
      attempts.push({ attacker, card, target: null, status: 'miss', reason: '没有合法目标' })
      return
    }
    if (mediated.has(target.id)) {
      attempts.push({ attacker, card, target, status: 'mediated', reason: `${target.name} 受调停保护` })
      return
    }
    const defended = playedCards(picks[target.id]).some(
      (c) => DEFENSE.includes(c.special ?? '') && isWin(c, rolls),
    )
    attempts.push({
      attacker,
      card,
      target,
      status: defended ? 'blocked' : 'ok',
      reason: defended ? `${target.name} 的防御牌` : '',
    })
  })

  // 3. 先判定所有针对/破坏，再统一结算，避免先后手影响
  attempts
    .filter((a) => a.status === 'ok')
    .forEach((a) => {
      const target = a.target!
      if (a.card.counterTag) {
        const tagged = playedCards(picks[target.id]).find((c) => c.tag === a.card.counterTag)
        if (tagged) {
          nullified.add(tagged.id)
          if (!target.nullifiedTags.includes(a.card.counterTag)) {
            target.nullifiedTags.push(a.card.counterTag)
          }
          const nemesis = isHostile(a.attacker.factionId, target.factionId)
          a.attacker.stats.morale += nemesis ? 2 : 1
          pierced.add(a.card.id)
          logs.push({
            round,
            tone: 'counter',
            text: `${a.attacker.name} 以「${a.card.name}」击穿了 ${target.name} 的【${a.card.counterTag}】，该牌收益归零；自身士气 +${nemesis ? 2 : 1}。`,
          })
        } else {
          a.attacker.stats.supply += 1
          whiffed.add(a.card.id)
          logs.push({
            round,
            tone: 'info',
            text: `${a.attacker.name} 的「${a.card.name}」没找到【${a.card.counterTag}】，空手而归，只摸到补给 +1。`,
          })
        }
      }
      if (a.card.op === 'sabotage') {
        const td = picks[target.id]?.designated
        if (td) nullified.add(td.id)
      }
    })
  // 3.5 KEY 获得：本回合打出、且没有被击穿的 KEY 牌，才算真正「拿到手」。
  // 「国剑 / 塔拉独立 / 新纲领」这类胜利条件以此为前提——不打牌就没有 KEY，
  // 也就无法获胜；一旦打出又被针对，则永久失效。这样 KEY 牌才有取舍意义。
  next.forEach((p) => {
    const pick = picks[p.id]
    if (!pick) return
    playedCards(pick).forEach((card) => {
      if (!card.tag) return
      if (nullified.has(card.id)) return
      if (!p.keyTags.includes(card.tag)) p.keyTags.push(card.tag)
    })
  })

  // 4. 指定牌命中 / 落空反噬
  attempts.forEach((a) => {
    const attacker = a.attacker
    const card = a.card
    if (a.status === 'mediated') {
      logs.push({
        round,
        tone: 'info',
        text: `${attacker.name} 的「${card.name}」被拉特兰的调停压住，未能生效。`,
      })
      return
    }
    if (a.status === 'blocked' || a.status === 'miss') {
      applyDelta(attacker, card.backlash ?? {})
      logs.push({
        round,
        tone: 'bad',
        text: `${attacker.name} 的「${card.name}」落空（${a.reason}），反噬：${effectSummary(card.backlash ?? {})}。`,
      })
      return
    }
    const target = a.target!
    if (nullified.has(card.id)) {
      logs.push({ round, tone: 'info', text: `${attacker.name} 的「${card.name}」被 ${target.name} 瓦解，未能生效。` })
      return
    }
    if (whiffed.has(card.id)) {
      logs.push({ round, tone: 'info', text: `${attacker.name} 的「${card.name}」针对落空，本回合未对 ${target.name} 造成额外影响。` })
      return
    }

    let hit = true
    let detail = ''
    if (card.op === 'strike') {
      target.stats.morale -= 4
      attacker.stats.morale += 1
      detail = `${target.name} 士气 -4，自身士气 +1`
    } else if (card.op === 'raid') {
      const take = Math.min(3, Math.max(0, target.stats.supply))
      target.stats.supply -= take
      attacker.stats.supply += take
      detail = `夺取 ${target.name} ${take} 点补给`
    } else if (card.op === 'siege') {
      target.stats.supply -= 3
      attacker.score += 3
      detail = `${target.name} 补给 -3，自身战绩 +3`
    } else if (card.op === 'sabotage') {
      const td = picks[target.id]?.designated
      if (pierced.has(card.id)) {
        // 已击穿 KEY 标签，reward 已在上面发放，不重复加士气
        detail = `${target.name} 的关键牌被击穿`
      } else if (td) {
        attacker.stats.morale += 1
        detail = `${target.name} 的「${td.name}」失效，自身士气 +1`
      } else {
        detail = `${target.name} 本回合没有可破坏的指定牌`
      }
    } else if (card.op === 'incite') {
      attacker.stats.morale += 1
      if (target.allyId) {
        const ally = byId.get(target.allyId)
        if (ally) ally.allyId = null
        detail = `解除 ${target.name} 的同盟，自身士气 +1`
      } else {
        detail = `${target.name} 本无同盟，自身士气 +1`
      }
      target.allyId = null
    } else if (card.op === 'expose') {
      attacker.stats.supply += 1
      const names = (picks[target.id]?.cards ?? []).map((c) => c.name).join('、') || '无'
      detail = `看穿 ${target.name} 的行动牌（${names}），自身补给 +1`
    } else if (card.op === 'decisive') {
      const diff = attacker.stats.manpower - target.stats.manpower
      if (diff >= 3) {
        const take = Math.min(5, Math.max(0, target.stats.supply))
        target.stats.supply -= take
        attacker.stats.supply += take
        target.stats.morale -= 3
        detail = `人力差 ${diff}，夺取 ${take} 补给，${target.name} 士气 -3`
      } else {
        hit = false
        applyDelta(attacker, card.backlash ?? { morale: -3 })
        detail = `人力差 ${diff} 未达 3，反噬：${effectSummary(card.backlash ?? { morale: -3 })}`
      }
    }
    const extra = effectSummary(card.effects ?? {})
    if (hit && extra !== '无') {
      applyCardDelta(attacker, card.effects ?? {}, card)
      detail = detail ? `${detail}，${extra}` : extra
    }
    if (hit && card.progress) attacker.warProgress += card.progress
    logs.push({
      round,
      tone: hit ? 'good' : 'bad',
      text: `${attacker.name} 的「${card.name}」${hit ? '命中' : '落空'} ${target.name}：${detail}。`,
    })
  })

  // 5. 行动牌效果：roll 牌用预掷结果，成功才结算 effects 与 special
  next.forEach((p) => {
    if (p.defeated) return
    ;(picks[p.id]?.cards ?? []).forEach((card) => {
      if (nullified.has(card.id)) return
      if (card.requiresAlly && !p.allyId) {
        logs.push({ round, tone: 'info', text: `${p.name} 的「${card.name}」需要同盟支持，效果落空。` })
        return
      }
      if (card.roll) {
        const win = rolls.get(card.id) ?? false
        const delta = win ? card.roll.win : card.roll.lose
        applyCardDelta(p, delta, card)
        logs.push({
          round,
          tone: win ? 'good' : 'bad',
          text: `${p.name} 的「${card.name}」${win ? '成功' : '失败'}：${effectSummary(delta)}。`,
        })
        if (win) runSpecial(p, card, next, logs, round)
        return
      }
      applyCardDelta(p, card.effects, card)
      runSpecial(p, card, next, logs, round)
    })
  })

  // 6. 盟约事件
  if (pact) {
    logs.push({ round, tone: 'pact', text: `盟约事件【${pact.name}】：${pact.text}` })
    next.forEach((p) => {
      if (p.defeated) return
      if (p.allyId && pact.allianceEffects) applyDelta(p, pact.allianceEffects)
      if (!p.allyId && pact.soloEffects) applyDelta(p, pact.soloEffects)
      if (p.betrayedThisRound && pact.betrayBonus) applyDelta(p, pact.betrayBonus)
    })
  }

  // 7. 同盟互援
  next.forEach((p) => {
    if (p.allyId && !p.defeated && !p.exiled) p.stats.morale += 1
  })

  // 8. 上限、溢出转战绩、崩溃与流亡
  next.forEach((p) => {
    const cap = p.exiled ? EXILE_CAP : STAT_CAP
    STAT_KEYS.forEach((k) => {
      if (p.stats[k] > cap) {
        if (!p.exiled) p.score += p.stats[k] - cap
        p.stats[k] = cap
      }
    })
    const collapsed = p.stats.manpower <= 0 || p.stats.supply <= 0 || p.stats.morale <= 0
    if (collapsed && !p.defeated) {
      if (!p.exileUsed) {
        p.exileUsed = true
        p.exiled = true
        p.stats = { manpower: 5, supply: 5, morale: 5 }
        if (p.allyId) {
          const ally = byId.get(p.allyId)
          if (ally) ally.allyId = null
          p.allyId = null
        }
        logs.push({ round, tone: 'bad', text: `${p.name} 崩溃，转入流亡状态（三项重置为 5）。` })
      } else {
        p.defeated = true
        logs.push({ round, tone: 'bad', text: `${p.name} 再次崩溃，彻底出局。` })
      }
    }
  })

  return { players: next, logs }
}

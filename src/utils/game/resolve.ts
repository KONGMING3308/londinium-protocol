/** 回合结算：代价 → 指定牌 → 行动牌 → 盟约事件 → 同盟互援 → 上限/流亡 */
import { HOSTILE_PAIRS } from '@/mocks/factions'
import { describePactEvent } from '@/utils/game/pact'
import type { CardDef, LogEntry, PactEventDef, Pick, PlayerState, Stats } from '@/types'

export const STAT_CAP = 50
export const EXILE_CAP = 12
export const STAT_KEYS = ['manpower', 'supply', 'morale'] as const

/**
 * 按当前身份截断上限：流亡 12、正常 50。
 * 结算第 8 步会做一次截断，但回合开始时的阵营牌与剧情修正同样可能把数值顶破上限，
 * 所以那条路径也必须走这里，否则流亡者会在选牌面板看到超过 12 的数。
 */
export function clampToCap(players: PlayerState[]): PlayerState[] {
  return players.map((p) => {
    const cap = p.exiled ? EXILE_CAP : STAT_CAP
    const stats = { ...p.stats }
    STAT_KEYS.forEach((k) => {
      if (stats[k] > cap) stats[k] = cap
    })
    return { ...p, stats }
  })
}

const DEFENSE: string[] = ['immunity', 'cancelCounter', 'redirect']

export function isHostile(a: string, b: string): boolean {
  return HOSTILE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

/**
 * 上限截断 + 崩溃／流亡／出局判定。
 *
 * 原地修改传入数组并返回它。结算第 8 步与回合开始（startRound）共用这一份，
 * 避免两处各自实现、漂移出「一处判流亡、另一处不判」的 bug。
 *
 * 为什么回合开始也要判：阵营牌／剧情事件可能把资源压到 ≤0，
 * 若只等结算第 8 步，玩家会带着负资源参加整回合的暗选与盟约窗口，界面显示负数。
 */
export function applyCollapse(players: PlayerState[], round: number, logs: LogEntry[]): PlayerState[] {
  const byId = new Map(players.map((p) => [p.id, p]))
  players.forEach((p) => {
    const cap = p.exiled ? EXILE_CAP : STAT_CAP
    // 超出上限的部分直接截断，不做任何隐藏记账
    STAT_KEYS.forEach((k) => {
      if (p.stats[k] > cap) p.stats[k] = cap
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
  return players
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

/**
 * 阵营「交换」牌结算：下一回合开始前生效，优先级高于剧情修正。
 * 一张牌写死两边 —— pair[0] 吃 effects，pair[1] 吃 allyEffects。
 * 因此这是唯一一处「不看谁选的、只看是哪一对」的结算。
 */
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
  const byFaction = new Map(next.map((p) => [p.factionId, p]))

  Object.values(pending).forEach((card) => {
    if (!card?.pair) return
    const [aFaction, bFaction] = card.pair
    const a = byFaction.get(aFaction)
    const b = byFaction.get(bFaction)
    // 交换的前提是这一对此刻仍然互为盟友，否则这笔交易作废
    const stillAllied =
      a && b && !a.defeated && !b.defeated && a.allyId === b.id && b.allyId === a.id
    if (!a || !b || !stillAllied) {
      const who = [a?.name, b?.name].filter(Boolean).join(' 与 ')
      logs.push({
        round: 0,
        tone: 'info',
        text: `同盟交换「${card.name}」${who ? `（${who}）` : ''}因同盟关系中断而作废。`,
      })
      return
    }

    applyCardDelta(a, card.effects, card)
    if (card.allyEffects) applyCardDelta(b, card.allyEffects, card)
    // 战争进度是萨卡兹的专属胜利线：其他阵营即使牌面误标了 progress 也不推进
    const aProgress = card.progress && a.factionId === 'SARK' ? card.progress : 0
    const bProgress = card.allyProgress && b.factionId === 'SARK' ? card.allyProgress : 0
    if (aProgress) a.warProgress += aProgress
    if (bProgress) b.warProgress += bProgress

    const parts: string[] = []
    const left = effectSummary(card.effects)
    if (left !== '无') parts.push(`${a.name} ${left}`)
    // 日志必须跟着「是否真的推进」走：只有萨卡兹甲方推进了才写，否则会谎报
    if (aProgress) parts.push(`${a.name} 战争进度 +${aProgress}`)
    const right = effectSummary(card.allyEffects ?? {})
    if (right !== '无') parts.push(`${b.name} ${right}`)
    if (bProgress) parts.push(`${b.name} 战争进度 +${bProgress}`)
    logs.push({
      round: 0,
      tone: 'good',
      text: `同盟交换「${card.name}」成立：${parts.join('，') || '双方无所获'}。`,
    })
  })

  return { players: next, logs }
}

/** 牌实例键：同一张卡在不同玩家手里是独立判定，不能只按 card.id 共用结果 */
function instanceKey(playerId: string, cardId: string): string {
  return `${playerId}::${cardId}`
}

/** 有 roll 的牌需要预掷成功才算拥有该 special；无 roll 视为成功 */
function isWin(playerId: string, card: CardDef, rolls: Map<string, boolean>): boolean {
  return card.roll ? rolls.get(instanceKey(playerId, card.id)) === true : true
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
    // 战争进度是萨卡兹专属胜利线：情报牌只该侦查萨卡兹，其他阵营恒为 0，
    // 不该让他们上「战争进度最高」的榜（否则萨卡兹出局后会出现「某某(0)」的怪日志）
    const richest = players
      .filter((o) => !o.defeated && o.factionId === 'SARK')
      .sort((a, b) => b.warProgress - a.warProgress)[0]
    logs.push({
      round,
      tone: 'info',
      text: richest
        ? `${p.name} 的「${card.name}」情报：战争进度最高的是 ${richest.name}（${richest.warProgress}）。`
        : `${p.name} 的「${card.name}」情报：萨卡兹军事委员会已不在场上，战争进度无从查起。`,
    })
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
  random: () => number = Math.random,
): ResolveResult {
  const logs: LogEntry[] = []
  const next = players.map((p) => ({
    ...p,
    stats: { ...p.stats },
    nullifiedTags: [...p.nullifiedTags],
  }))
  const byId = new Map(next.map((p) => [p.id, p]))
  /** 下面这些集合统一按「实例键」（playerId::cardId）记账：同 id 的牌在不同玩家手里不能串 */
  const nullified = new Set<string>()
  /** 记录「谁让这张牌失效」：日志要写击穿者，不能拿被指定的目标凑数 */
  const nullifiedBy = new Map<string, { name: string; how: 'counter' | 'sabotage' }>()
  /** 已击穿 KEY 标签的指定牌，避免与 sabotage 的基础收益重复计数 */
  const pierced = new Set<string>()
  /** 针对标签落空的指定牌 id：只摸到补给，不再结算 op 收益 */
  const whiffed = new Set<string>()
  /** 因发起者流亡而未生效的指定牌 id：不生效就不该被击穿，也不该计入 KEY */
  const inertDesignated = new Set<string>()
  /** 补给线被切断的玩家 id：本回合其补给的正向收益归零，但代价照扣 */
  const cutSupply = new Set<string>()
  /** 统一预掷：success 才拥有 roll 牌的效果与 special */
  const rolls = new Map<string, boolean>()
  next.forEach((p) => {
    ;(picks[p.id]?.cards ?? []).forEach((c) => {
      if (c.roll) rolls.set(instanceKey(p.id, c.id), random() < c.roll.chance)
    })
  })

  const truceLine = next
    .filter((p) => !p.defeated)
    .map((p) => ({ player: p, cards: playedCards(picks[p.id]) }))
    .filter((row) => row.cards.some((c) => c.special === 'truce' && isWin(row.player.id, c, rolls)))

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
      inertDesignated.add(instanceKey(attacker.id, card.id))
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
      (c) => DEFENSE.includes(c.special ?? '') && isWin(target.id, c, rolls),
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
        // 未生效的牌不能被击穿：流亡者的指定牌既没打出去，也就不该被针对
        const tagged = playedCards(picks[target.id]).find(
          (c) => c.tag === a.card.counterTag && !inertDesignated.has(instanceKey(target.id, c.id)),
        )
        if (tagged) {
          nullified.add(instanceKey(target.id, tagged.id))
          nullifiedBy.set(instanceKey(target.id, tagged.id), { name: a.attacker.name, how: 'counter' })
          if (!target.nullifiedTags.includes(a.card.counterTag)) {
            target.nullifiedTags.push(a.card.counterTag)
          }
          const nemesis = isHostile(a.attacker.factionId, target.factionId)
          a.attacker.stats.morale += nemesis ? 2 : 1
          pierced.add(instanceKey(a.attacker.id, a.card.id))
          logs.push({
            round,
            tone: 'counter',
            text: `${a.attacker.name} 以「${a.card.name}」击穿了 ${target.name} 的【${a.card.counterTag}】，该牌收益归零；自身士气 +${nemesis ? 2 : 1}。`,
          })
        } else {
          a.attacker.stats.supply += 1
          whiffed.add(instanceKey(a.attacker.id, a.card.id))
          logs.push({
            round,
            tone: 'info',
            text: `${a.attacker.name} 的「${a.card.name}」没找到【${a.card.counterTag}】，空手而归，只摸到补给 +1。`,
          })
        }
      }
      if (a.card.op === 'sabotage') {
        const td = picks[target.id]?.designated
        // 已被 counterTag 击穿的牌不重复记账，否则日志归因会被「破坏」覆盖掉
        if (td && !inertDesignated.has(instanceKey(target.id, td.id)) && !nullified.has(instanceKey(target.id, td.id))) {
          nullified.add(instanceKey(target.id, td.id))
          nullifiedBy.set(instanceKey(target.id, td.id), { name: a.attacker.name, how: 'sabotage' })
        }
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
      if (nullified.has(instanceKey(p.id, card.id))) return
      if (inertDesignated.has(instanceKey(p.id, card.id))) return
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
      // 不用「落空」这种像概率失败的词：这里只有两种确定原因——没人可打，或被防御牌挡下
      const why =
        a.status === 'miss'
          ? '没有可打的目标'
          : a.reason
            ? `被 ${a.reason} 挡下`
            : '被挡下'
      logs.push({
        round,
        tone: 'bad',
        text: `${attacker.name} 的「${card.name}」${why}，反噬：${effectSummary(card.backlash ?? {})}。`,
      })
      return
    }
    const target = a.target!
    if (nullified.has(instanceKey(attacker.id, card.id))) {
      // 归因：真正让这张牌失效的是击穿/破坏它的人，不是本回合被它指定的目标
      const by = nullifiedBy.get(instanceKey(attacker.id, card.id))
      const how = by?.how === 'sabotage' ? '破坏' : '击穿'
      logs.push({
        round,
        tone: 'info',
        text: by
          ? `${attacker.name} 的「${card.name}」被 ${by.name} ${how}，未能生效。`
          : `${attacker.name} 的「${card.name}」未能生效。`,
      })
      return
    }
    if (whiffed.has(instanceKey(attacker.id, card.id))) {
      // counterTag 未命中：上面第 3 步已经写过「空手而归，只摸到补给 +1」，
      // 这里只负责阻止后续 op 收益重复结算，不再补一条重复日志。
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
      detail = `${target.name} 补给 -3`
    } else if (card.op === 'sabotage') {
      const td = picks[target.id]?.designated
      if (pierced.has(instanceKey(attacker.id, card.id))) {
        // 已击穿 KEY 标签，reward 已在上面发放，不重复加士气
        detail = `${target.name} 的关键牌被击穿`
      } else if (td && !inertDesignated.has(instanceKey(target.id, td.id))) {
        attacker.stats.morale += 1
        detail = `${target.name} 的「${td.name}」失效，自身士气 +1`
      } else {
        detail = `${target.name} 本回合没有可破坏的指定牌`
      }
    } else if (card.op === 'cut') {
      cutSupply.add(target.id)
      const grab = Math.min(1, Math.max(0, target.stats.supply))
      target.stats.supply -= grab
      attacker.stats.supply += grab
      detail = `切断 ${target.name} 的补给线：本回合补给收益全部归零，并顺走 ${grab} 点库存`
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
    // 同上：只有萨卡兹的指定牌推进战争进度
    const warGain = hit && card.progress && attacker.factionId === 'SARK' ? card.progress : 0
    if (warGain) attacker.warProgress += warGain
    if (warGain) detail = `${detail}，战争进度 +${warGain}`
    logs.push({
      round,
      tone: hit ? 'good' : 'bad',
      text: `${attacker.name} 的「${card.name}」${hit ? '命中' : '落空'} ${target.name}：${detail}。`,
    })
  })

  // 5. 行动牌效果：roll 牌用预掷结果，成功才结算 effects 与 special
  //    补给线被切断的玩家，本次结算中补给的正向增量归零——代价在第 1 步已扣掉，不会退回。
  next.forEach((p) => {
    if (p.defeated) return
    const severed = cutSupply.has(p.id)
    /** 切断补给线时，抹掉这一次结算里的补给正向收益 */
    const gate = (delta: Partial<Stats>): Partial<Stats> =>
      severed && (delta.supply ?? 0) > 0 ? { ...delta, supply: 0 } : delta
    ;(picks[p.id]?.cards ?? []).forEach((card) => {
      if (nullified.has(instanceKey(p.id, card.id))) return
      if (card.requiresAlly && !p.allyId) {
        logs.push({ round, tone: 'info', text: `${p.name} 的「${card.name}」需要同盟支持，效果落空。` })
        return
      }
      if (card.roll) {
        const win = rolls.get(instanceKey(p.id, card.id)) ?? false
        const raw = win ? card.roll.win : card.roll.lose
        const delta = gate(raw)
        applyCardDelta(p, delta, card)
        logs.push({
          round,
          tone: win ? 'good' : 'bad',
          text: `${p.name} 的「${card.name}」${win ? '成功' : '失败'}：${effectSummary(delta)}。`,
        })
        if (delta !== raw) {
          logs.push({
            round,
            tone: 'bad',
            text: `${p.name} 的补给线已被切断，本次补给 +${raw.supply} 归零（代价照扣）。`,
          })
        }
        if (win) runSpecial(p, card, next, logs, round)
        return
      }
      const raw = card.effects
      const delta = gate(raw)
      applyCardDelta(p, delta, card)
      if (delta !== raw) {
        logs.push({
          round,
          tone: 'bad',
          text: `${p.name} 的补给线已被切断，本次补给 +${raw.supply} 归零（代价照扣）。`,
        })
      }
      runSpecial(p, card, next, logs, round)
    })
  })

  // 6. 盟约事件
  if (pact) {
    // 先写叙事，再补一句「谁 + 谁 -」的数值，避免玩家只看到故事却不知道触发了个啥
    const deltaText = describePactEvent(pact)
    logs.push({
      round,
      tone: 'pact',
      text: `盟约事件【${pact.name}】：${pact.text}（${deltaText}）`,
    })
    next.forEach((p) => {
      if (p.defeated) return
      if (p.allyId && pact.allianceEffects) applyDelta(p, pact.allianceEffects)
      if (!p.allyId && pact.soloEffects) applyDelta(p, pact.soloEffects)
    })
  }

  // 7. 同盟互援
  next.forEach((p) => {
    if (p.allyId && !p.defeated && !p.exiled) p.stats.morale += 1
  })

  // 8. 上限、崩溃与流亡（复用 applyCollapse，与回合开始共一份实现）
  applyCollapse(next, round, logs)

  return { players: next, logs }
}

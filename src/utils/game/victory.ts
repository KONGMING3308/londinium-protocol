/**
 * 非对称胜负判定：R6、R7 回合结束执行，先达成者胜。
 *
 * R6 提前判胜门槛整体高于 R7（A1）：
 * - R7 是「正常达成」：各阵营按基础门槛判胜。
 * - R6 是「碾压达成」：同样的目标，但数值门槛统一 +2，让「提前结束」成为少数强势局的
 *   结果，而不是常态——否则第 7 回合的专属内容（SARK D7／RI D7／E7 剧情）几乎上不了场。
 *
 * B 系列平衡调参（v0.4.2 后）：
 * - B1：SARK 士气门槛 8 → 10（士气线不再形同虚设）。
 * - B2：多方同时达标不再按固定 ORDER 取首位，改用「士气高者胜 → 三线和高者胜 → ORDER」的
 *   次级比较，解决「达标不赢」。
 * - B4：REU 三线 ≥10 → 双线 ≥10（经济垫底却条件最全，放宽到两线）。
 * - B6：士气通胀使「士气 ≥12」门槛虚设，SSC／TARA（有典范军）／RI 守门的士气门槛统一上
 *   调为 ≥13。
 */
import type { FactionId, PlayerState } from '@/types'

export interface VictoryResult {
  factionId: FactionId
  reason: string
}

const ORDER: FactionId[] = ['SARK', 'VIC', 'TARA', 'RI', 'REU', 'SSC']

function allAtLeast(p: PlayerState, v: number): boolean {
  return p.stats.manpower >= v && p.stats.supply >= v && p.stats.morale >= v
}

/** B4：REU 胜利只需「三线中至少两线」达标 */
function twoAtLeast(p: PlayerState, v: number): boolean {
  const lines = [p.stats.manpower, p.stats.supply, p.stats.morale]
  return lines.filter((x) => x >= v).length >= 2
}

function sumStats(p: PlayerState): number {
  return p.stats.manpower + p.stats.supply + p.stats.morale
}

/** 曾崩溃过的玩家：流亡后恢复也不再算“没倒下” */
function everFallen(p: PlayerState): boolean {
  return p.exileUsed || p.defeated
}

function someoneFallen(players: PlayerState[], selfId: string): boolean {
  return players.some((p) => p.id !== selfId && everFallen(p))
}

function othersNotFallen(players: PlayerState[], selfId: string): number {
  return players.filter((p) => p.id !== selfId && !everFallen(p)).length
}

/** 门槛：R6 提前判胜统一 +2 */
function gate(round: number, base: number): number {
  return round === 6 ? base + 2 : base
}

function checkSark(p: PlayerState, round: number): VictoryResult | null {
  // B1：士气门槛 8 → 10（R6 为 12）
  if (p.warProgress >= 3 && p.stats.morale >= gate(round, 10)) {
    return { factionId: 'SARK', reason: '战争进度达到 3，阿喃那的呼唤已成事实。' }
  }
  return null
}

function checkVic(p: PlayerState, players: PlayerState[], round: number): VictoryResult | null {
  if (
    p.keyTags.includes('国剑') &&
    !p.nullifiedTags.includes('国剑') &&
    allAtLeast(p, gate(round, 12)) &&
    someoneFallen(players, p.id)
  ) {
    return { factionId: 'VIC', reason: '国剑仍在王嗣手中，典范军重新统一王权。' }
  }
  return null
}

function checkTara(p: PlayerState, players: PlayerState[], round: number): VictoryResult | null {
  const vic = players.find((o) => o.factionId === 'VIC' && !o.defeated)
  if (!p.keyTags.includes('塔拉独立')) return null
  if (p.nullifiedTags.includes('塔拉独立')) return null
  if (vic) {
    const vicWins =
      vic.keyTags.includes('国剑') &&
      !vic.nullifiedTags.includes('国剑') &&
      allAtLeast(vic, gate(round, 12)) &&
      someoneFallen(players, vic.id)
    if (vicWins) return null
    // B6：士气门槛 12 → 13（R6 为 15）
    if (p.stats.morale >= gate(round, 13)) {
      return { factionId: 'TARA', reason: '塔拉独立未被压制，红龙加冕为塔拉的王。' }
    }
    return null
  }
  // A-05：本局无典范军可咬时，改为士气全场最高且 ≥15（R6 为 17）
  const top = Math.max(...players.filter((o) => !o.defeated).map((o) => o.stats.morale))
  if (p.stats.morale >= gate(round, 15) && p.stats.morale === top) {
    return { factionId: 'TARA', reason: '没有典范军可咬，塔拉仍以最高的士气宣告独立。' }
  }
  return null
}

function checkReu(p: PlayerState, players: PlayerState[], round: number): VictoryResult | null {
  if (
    p.keyTags.includes('新纲领') &&
    !p.nullifiedTags.includes('新纲领') &&
    twoAtLeast(p, gate(round, 10)) &&
    someoneFallen(players, p.id)
  ) {
    return { factionId: 'REU', reason: '新纲领成立，废墟上的统一战线开始运转。' }
  }
  return null
}

function checkSsc(p: PlayerState, players: PlayerState[], round: number): VictoryResult | null {
  // B6：士气门槛 12 → 13（R6 为 15）
  if (!everFallen(p) && p.stats.morale >= gate(round, 13) && othersNotFallen(players, p.id) >= 2) {
    return { factionId: 'SSC', reason: '城市没有赢，但市民活下来了。' }
  }
  return null
}

/** 返回首个达成的阵营；RI 作为守门人单独处理 */
export function judgeVictory(players: PlayerState[], round: number): VictoryResult | null {
  if (round < 6) return null
  const results: VictoryResult[] = []

  players.forEach((p) => {
    if (p.defeated) return
    if (p.factionId === 'SARK') {
      const r = checkSark(p, round)
      if (r) results.push(r)
    }
    if (p.factionId === 'VIC') {
      const r = checkVic(p, players, round)
      if (r) results.push(r)
    }
    if (p.factionId === 'TARA') {
      const r = checkTara(p, players, round)
      if (r) results.push(r)
    }
    if (p.factionId === 'REU') {
      const r = checkReu(p, players, round)
      if (r) results.push(r)
    }
    if (p.factionId === 'SSC') {
      const r = checkSsc(p, players, round)
      if (r) results.push(r)
    }
  })

  const byFaction = (id: FactionId) => players.find((p) => p.factionId === id)
  // B2：多方达标不再只按固定 ORDER 取首位，改用次级比较：
  // 士气高者胜 → 三线和高者胜 → 仍并列才退回 ORDER。
  const nonRi = results
    .filter((r) => r.factionId !== 'RI')
    .sort((a, b) => {
      const pa = byFaction(a.factionId)
      const pb = byFaction(b.factionId)
      const ma = pa ? pa.stats.morale : 0
      const mb = pb ? pb.stats.morale : 0
      if (ma !== mb) return mb - ma
      const sa = pa ? sumStats(pa) : 0
      const sb = pb ? sumStats(pb) : 0
      if (sa !== sb) return sb - sa
      return ORDER.indexOf(a.factionId) - ORDER.indexOf(b.factionId)
    })
  if (nonRi.length > 0) return nonRi[0]

  const ri = players.find((p) => p.factionId === 'RI' && !p.defeated)
  if (!ri) return null
  const sark = players.find((p) => p.factionId === 'SARK' && !p.defeated)
  if (sark?.nullifiedTags.includes('阿喃那')) {
    return { factionId: 'RI', reason: '承冠打断了阿喃那的降临，战争被阻止。' }
  }
  const highest = Math.max(...players.filter((p) => !p.defeated).map((p) => p.stats.morale))
  // B6：守门士气门槛 12 → 13（R6 为 15）
  if (results.length === 0 && ri.stats.morale >= gate(round, 13) && ri.stats.morale === highest) {
    return { factionId: 'RI', reason: '无人达成目标，罗德岛以最高的士气守住了终局。' }
  }
  return null
}

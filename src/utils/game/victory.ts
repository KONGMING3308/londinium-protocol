/** 非对称胜负判定：仅在 R6、R7 回合结束执行，先达成者胜 */
import type { FactionId, PlayerState } from '@/types'

export interface VictoryResult {
  factionId: FactionId
  reason: string
}

const ORDER: FactionId[] = ['SARK', 'VIC', 'TARA', 'RI', 'REU', 'SSC']

function allAtLeast(p: PlayerState, v: number): boolean {
  return p.stats.manpower >= v && p.stats.supply >= v && p.stats.morale >= v
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

function checkSark(p: PlayerState): VictoryResult | null {
  if (p.warProgress >= 3 && p.stats.morale >= 8) {
    return { factionId: 'SARK', reason: '战争进度达到 3，阿喃那的呼唤已成事实。' }
  }
  return null
}

function checkVic(p: PlayerState, players: PlayerState[]): VictoryResult | null {
  if (
    !p.nullifiedTags.includes('国剑') &&
    allAtLeast(p, 12) &&
    someoneFallen(players, p.id)
  ) {
    return { factionId: 'VIC', reason: '国剑仍在王嗣手中，典范军重新统一王权。' }
  }
  return null
}

function checkTara(p: PlayerState, players: PlayerState[]): VictoryResult | null {
  const vic = players.find((o) => o.factionId === 'VIC' && !o.defeated)
  if (p.nullifiedTags.includes('塔拉独立')) return null
  if (vic) {
    const vicWins = !vic.nullifiedTags.includes('国剑') && allAtLeast(vic, 12) && someoneFallen(players, vic.id)
    if (vicWins) return null
    if (p.stats.morale >= 12) {
      return { factionId: 'TARA', reason: '塔拉独立未被压制，红龙加冕为塔拉的王。' }
    }
    return null
  }
  // A-05：本局无典范军可咬时，改为士气全场最高且 ≥15
  const top = Math.max(...players.filter((o) => !o.defeated).map((o) => o.stats.morale))
  if (p.stats.morale >= 15 && p.stats.morale === top) {
    return { factionId: 'TARA', reason: '没有典范军可咬，塔拉仍以最高的士气宣告独立。' }
  }
  return null
}

function checkReu(p: PlayerState, players: PlayerState[]): VictoryResult | null {
  if (!p.nullifiedTags.includes('新纲领') && allAtLeast(p, 10) && someoneFallen(players, p.id)) {
    return { factionId: 'REU', reason: '新纲领成立，废墟上的统一战线开始运转。' }
  }
  return null
}

function checkSsc(p: PlayerState, players: PlayerState[]): VictoryResult | null {
  if (!everFallen(p) && p.stats.morale >= 12 && othersNotFallen(players, p.id) >= 2) {
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
      const r = checkSark(p)
      if (r) results.push(r)
    }
    if (p.factionId === 'VIC') {
      const r = checkVic(p, players)
      if (r) results.push(r)
    }
    if (p.factionId === 'TARA') {
      const r = checkTara(p, players)
      if (r) results.push(r)
    }
    if (p.factionId === 'REU') {
      const r = checkReu(p, players)
      if (r) results.push(r)
    }
    if (p.factionId === 'SSC') {
      const r = checkSsc(p, players)
      if (r) results.push(r)
    }
  })

  const nonRi = results
    .filter((r) => r.factionId !== 'RI')
    .sort((a, b) => ORDER.indexOf(a.factionId) - ORDER.indexOf(b.factionId))
  if (nonRi.length > 0) return nonRi[0]

  const ri = players.find((p) => p.factionId === 'RI' && !p.defeated)
  if (!ri) return null
  const sark = players.find((p) => p.factionId === 'SARK' && !p.defeated)
  if (sark?.nullifiedTags.includes('阿喃那')) {
    return { factionId: 'RI', reason: '承冠打断了阿喃那的降临，战争被阻止。' }
  }
  const highest = Math.max(...players.filter((p) => !p.defeated).map((p) => p.stats.morale))
  if (results.length === 0 && ri.stats.morale >= 12 && ri.stats.morale === highest) {
    return { factionId: 'RI', reason: '无人达成目标，罗德岛以最高的士气守住了终局。' }
  }
  return null
}

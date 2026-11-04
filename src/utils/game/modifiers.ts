/** 剧情修正：每回合开始时的固定增减 */
import { ROUND_MODIFIERS } from '@/mocks'
import type { PlayerState } from '@/types'

export function applyRoundModifier(players: PlayerState[], round: number): PlayerState[] {
  const mod = ROUND_MODIFIERS.find((m) => m.round === round)
  if (!mod) return players
  return players.map((p) => {
    const d = mod.deltas[p.factionId] ?? {}
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

export function getModifier(round: number) {
  return ROUND_MODIFIERS.find((m) => m.round === round) ?? ROUND_MODIFIERS[0]
}

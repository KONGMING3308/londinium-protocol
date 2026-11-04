/** 同盟的建立与撕毁：只改玩家关系，不产生文案 */
import { canAlly } from '@/mocks/factions'
import type { PlayerState } from '@/types'

export const MAX_ALLIANCE_PAIRS = 2

/** 返回更新后的玩家列表；资格不符返回 null */
export function createAlliance(players: PlayerState[], aId: string, bId: string): PlayerState[] | null {
  const a = players.find((p) => p.id === aId)
  const b = players.find((p) => p.id === bId)
  if (!a || !b || a.allyId || b.allyId || a.betrayed || b.betrayed) return null
  if (!canAlly(a.factionId, b.factionId)) return null
  if (players.filter((p) => p.allyId).length / 2 >= MAX_ALLIANCE_PAIRS) return null
  return players.map((p) => {
    if (p.id === aId) return { ...p, allyId: bId }
    if (p.id === bId) return { ...p, allyId: aId }
    return p
  })
}

/** 撕毁发起者的盟约；返回新玩家列表与另一方 id */
export function dissolveAlliance(players: PlayerState[], id: string): { players: PlayerState[]; partnerId: string } | null {
  const a = players.find((p) => p.id === id)
  if (!a || !a.allyId) return null
  const partnerId = a.allyId
  const next = players.map((p) => {
    if (p.id === id) return { ...p, allyId: null, betrayed: true, betrayedThisRound: true }
    if (p.id === partnerId) return { ...p, allyId: null }
    return p
  })
  return { players: next, partnerId }
}

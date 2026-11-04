/** 玩家构造：把阵营初始值落成 PlayerState */
import { FACTION_MAP } from '@/mocks/factions'
import type { FactionId, PlayerState } from '@/types'

export function makePlayer(name: string, factionId: FactionId, index: number): PlayerState {
  return {
    id: `p${index + 1}`,
    name,
    factionId,
    stats: { ...FACTION_MAP[factionId].base },
    score: 0,
    warProgress: 0,
    heldDesignated: null,
    exileUsed: false,
    exiled: false,
    defeated: false,
    allyId: null,
    betrayed: false,
    betrayedThisRound: false,
    nullifiedTags: [],
  }
}

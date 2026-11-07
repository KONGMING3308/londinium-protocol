/** mock 数据聚合入口 */
import type { CardDef, FactionId } from '@/types'
import { SARK_ACTIONS, SARK_DESIGNATED } from './cards/sark'
import { VIC_ACTIONS, VIC_DESIGNATED } from './cards/vic'
import { RI_ACTIONS, RI_DESIGNATED } from './cards/ri'
import { TARA_ACTIONS, TARA_DESIGNATED } from './cards/tara'
import { REU_ACTIONS, REU_DESIGNATED } from './cards/reu'
import { SSC_ACTIONS, SSC_DESIGNATED } from './cards/ssc'
import { GENERIC_CARDS } from './cards/generic'
import { FACTION_CARDS } from './cards/factionCards'
import { PACT_EVENTS } from './pacts'
import { ROUND_THEMES, getRoundTheme } from './modifiers'
import { STORY_EVENTS, storyCandidates } from './story'
import { NEUTRAL_POINTS, drawNeutralPoints } from './neutral'

export const FACTION_ACTIONS: Record<FactionId, CardDef[]> = {
  SARK: SARK_ACTIONS,
  VIC: VIC_ACTIONS,
  RI: RI_ACTIONS,
  TARA: TARA_ACTIONS,
  REU: REU_ACTIONS,
  SSC: SSC_ACTIONS,
}

export const FACTION_DESIGNATED: Record<FactionId, CardDef[]> = {
  SARK: SARK_DESIGNATED,
  VIC: VIC_DESIGNATED,
  RI: RI_DESIGNATED,
  TARA: TARA_DESIGNATED,
  REU: REU_DESIGNATED,
  SSC: SSC_DESIGNATED,
}

export {
  GENERIC_CARDS,
  FACTION_CARDS,
  PACT_EVENTS,
  ROUND_THEMES,
  getRoundTheme,
  STORY_EVENTS,
  storyCandidates,
  NEUTRAL_POINTS,
  drawNeutralPoints,
}

/** 牌库：按战略轴发 3 张阵营行动牌 + 1 张中立援助（3 张行动牌轴不重复） */
import { FACTION_ACTIONS, FACTION_CARDS, GENERIC_CARDS } from '@/mocks'
import type { Axis, CardDef, FactionId } from '@/types'

function shuffle<T>(list: T[]): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 阵营行动池 */
export function buildDeck(factionId: FactionId): CardDef[] {
  return shuffle(FACTION_ACTIONS[factionId])
}

/** 中立行动池 */
export function buildNeutralDeck(): CardDef[] {
  return shuffle(GENERIC_CARDS)
}

/** 阵营牌全局池（不按同盟分池） */
export function buildFactionDeck(): CardDef[] {
  return shuffle(FACTION_CARDS)
}

interface DrawOne {
  card: CardDef
  deck: CardDef[]
  discard: CardDef[]
}

/** 抽一张轴不在 exclude 内的牌；当前牌堆缺少可用轴时，把弃牌堆洗回后重找 */
function pickByAxis(deck: CardDef[], discard: CardDef[], exclude: Axis[]): DrawOne {
  let source = [...deck]
  let trash = [...discard]
  const findUnused = () => source.findIndex((c) => c.axis && !exclude.includes(c.axis))

  let idx = findUnused()
  if (idx < 0 && trash.length > 0) {
    // 洗回弃牌堆时也要排除已用轴，否则会抽到重复轴
    source = shuffle([...source, ...trash])
    trash = []
    idx = findUnused()
  }
  // 轴已用尽时允许重复轴，但至少要有一张牌
  if (idx < 0) idx = source.findIndex((c) => c.axis)
  if (idx < 0) idx = 0

  const card = source[idx]
  return { card, deck: source.filter((_, i) => i !== idx), discard: trash }
}

export interface ActionHandResult {
  hand: CardDef[]
  factionDeck: CardDef[]
  factionDiscard: CardDef[]
  neutralDeck: CardDef[]
  neutralDiscard: CardDef[]
}

/** 发一手行动牌：3 张阵营 + 1 张中立，三张阵营牌轴不重复 */
export function drawActionHand(
  factionDeck: CardDef[],
  factionDiscard: CardDef[],
  neutralDeck: CardDef[],
  neutralDiscard: CardDef[],
): ActionHandResult {
  const neutral = pickByAxis(neutralDeck, neutralDiscard, [])
  const first = pickByAxis(factionDeck, factionDiscard, [])
  const excludeFirst: Axis[] = first.card.axis ? [first.card.axis] : []
  const second = pickByAxis(first.deck, first.discard, excludeFirst)
  const excludeSecond: Axis[] = [
    ...excludeFirst,
    ...(second.card.axis ? [second.card.axis] : []),
  ]
  const third = pickByAxis(second.deck, second.discard, excludeSecond)

  return {
    hand: [first.card, second.card, third.card, neutral.card],
    factionDeck: third.deck,
    factionDiscard: third.discard,
    neutralDeck: neutral.deck,
    neutralDiscard: neutral.discard,
  }
}

export interface FactionDrawResult {
  cards: CardDef[]
  deck: CardDef[]
  discard: CardDef[]
}

/** 从全局阵营牌池抽 count 张候选；池不足时把弃牌堆洗回 */
export function drawFactionCards(
  deck: CardDef[],
  discard: CardDef[],
  count: number,
): FactionDrawResult {
  let source = shuffle(deck)
  let trash = [...discard]
  if (source.length < count) {
    source = shuffle([...source, ...trash])
    trash = []
  }
  const cards = source.slice(0, Math.max(0, count))
  return { cards, deck: source.slice(cards.length), discard: trash }
}

export function getDesignated(factionId: FactionId, round: number, all: CardDef[]): CardDef | null {
  return all.find((c) => c.owner === factionId && c.round === round) ?? null
}

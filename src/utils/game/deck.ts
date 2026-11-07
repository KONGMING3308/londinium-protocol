/** 牌库：按战略轴发 3 张阵营行动牌 + 1 张中立援助（3 张行动牌轴不重复） */
import { FACTION_ACTIONS, FACTION_CARDS, GENERIC_CARDS } from '@/mocks'
import type { Axis, CardDef, FactionId } from '@/types'

function shuffle<T>(list: T[], random: () => number = Math.random): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 阵营行动池 */
export function buildDeck(factionId: FactionId, random: () => number = Math.random): CardDef[] {
  return shuffle(FACTION_ACTIONS[factionId], random)
}

/** 中立行动池 */
export function buildNeutralDeck(random: () => number = Math.random): CardDef[] {
  return shuffle(GENERIC_CARDS, random)
}

/** 阵营牌全局池（不按同盟分池） */
export function buildFactionDeck(random: () => number = Math.random): CardDef[] {
  return shuffle(FACTION_CARDS, random)
}

interface DrawOne {
  card: CardDef
  deck: CardDef[]
  discard: CardDef[]
}

/** 抽一张轴不在 exclude 内的牌；当前牌堆缺少可用轴时，把弃牌堆洗回后重找 */
function pickByAxis(
  deck: CardDef[],
  discard: CardDef[],
  exclude: Axis[],
  random: () => number,
): DrawOne {
  let source = [...deck]
  let trash = [...discard]
  const findUnused = () => source.findIndex((c) => c.axis && !exclude.includes(c.axis))

  let idx = findUnused()
  if (idx < 0 && trash.length > 0) {
    // 洗回弃牌堆时也要排除已用轴，否则会抽到重复轴
    source = shuffle([...source, ...trash], random)
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
  /** 付得起代价的判定；传入后会在抽牌阶段做保底，见下方说明 */
  canPay?: (card: CardDef) => boolean,
  random: () => number = Math.random,
): ActionHandResult {
  const neutral = pickByAxis(neutralDeck, neutralDiscard, [], random)
  const first = pickByAxis(factionDeck, factionDiscard, [], random)
  const excludeFirst: Axis[] = first.card.axis ? [first.card.axis] : []
  const second = pickByAxis(first.deck, first.discard, excludeFirst, random)
  const excludeSecond: Axis[] = [
    ...excludeFirst,
    ...(second.card.axis ? [second.card.axis] : []),
  ]
  const third = pickByAxis(second.deck, second.discard, excludeSecond, random)

  const factionHand = [first.card, second.card, third.card]
  let pool = third.deck
  let trash = third.discard

  // 保底：三张里至少要能选出两张。
  // 资源见底时玩家仍可透支出牌（结算层不设下限），但如果整手牌全都付不起，
  // 暗选就变成了没有意义的形式，所以这里先从剩余牌堆换进付得起的牌。
  // 换不到（牌库确实没有付得起的牌）时保持原样，由界面提示玩家透支。
  if (canPay) {
    for (let i = 0; i < factionHand.length; i += 1) {
      if (factionHand.filter(canPay).length >= 2) break
      if (canPay(factionHand[i])) continue
      let j = pool.findIndex(canPay)
      if (j < 0 && trash.length > 0) {
        pool = shuffle([...pool, ...trash], random)
        trash = []
        j = pool.findIndex(canPay)
      }
      if (j < 0) break
      const swapIn = pool[j]
      pool = pool.filter((_, k) => k !== j)
      trash = [...trash, factionHand[i]]
      factionHand[i] = swapIn
    }
  }

  return {
    hand: [...factionHand, neutral.card],
    factionDeck: pool,
    factionDiscard: trash,
    neutralDeck: neutral.deck,
    neutralDiscard: neutral.discard,
  }
}

export interface FactionDrawResult {
  cards: CardDef[]
  deck: CardDef[]
  discard: CardDef[]
}

/** 同盟对的唯一键：与顺序无关，用于给每一对同盟单独分池 */
export function pairKeyOf(pair: [FactionId, FactionId]): string {
  return [...pair].sort().join('+')
}

/** 按同盟对从全局池中抽 count 张专属交换牌；本对的池不足时只洗回本对的弃牌 */
export function drawFactionCardsForPair(
  deck: CardDef[],
  discard: CardDef[],
  key: string,
  count: number,
  random: () => number = Math.random,
): FactionDrawResult {
  const mine = (c: CardDef) => Boolean(c.pair) && pairKeyOf(c.pair!) === key
  const others = deck.filter((c) => !mine(c))
  const otherTrash = discard.filter((c) => !mine(c))
  let source = shuffle(deck.filter(mine), random)
  let trash = [...discard.filter(mine)]
  if (source.length < count) {
    source = shuffle([...source, ...trash], random)
    trash = []
  }
  const cards = source.slice(0, Math.max(0, count))
  return {
    cards,
    deck: [...others, ...source.slice(cards.length)],
    discard: [...otherTrash, ...trash],
  }
}

/** 从全局阵营牌池抽 count 张候选；池不足时把弃牌堆洗回 */
export function drawFactionCards(
  deck: CardDef[],
  discard: CardDef[],
  count: number,
  random: () => number = Math.random,
): FactionDrawResult {
  let source = shuffle(deck, random)
  let trash = [...discard]
  if (source.length < count) {
    source = shuffle([...source, ...trash], random)
    trash = []
  }
  const cards = source.slice(0, Math.max(0, count))
  return { cards, deck: source.slice(cards.length), discard: trash }
}

export function getDesignated(factionId: FactionId, round: number, all: CardDef[]): CardDef | null {
  return all.find((c) => c.owner === factionId && c.round === round) ?? null
}

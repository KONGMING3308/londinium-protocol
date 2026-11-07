/**
 * 联机版暗选面板：四人同时选牌，本面板只渲染「我自己」的界面。
 *
 * 与热座版的差别
 * - 不再有「当前操作者」：`match.self` 永远是我自己，别人的手牌与保留牌根本不在快照里，
 *   所以这里不做任何猜测，也不展示他人的私有信息。
 * - 表单是纯本地状态，提交后等服务器快照，不做乐观更新（多人环境下乐观更新必然和快照打架）。
 * - 提交载荷严格对齐服务端 submitPick 的校验口径：
 *   · 行动牌恰好 2 张，且来自本人手牌；
 *   · 流亡者不能打出指定牌（只能保留或弃置）；
 *   · play 与 keep 不能同时非空（服务端会整单拒绝）；
 *   · 打出指定牌时必须给一个「未出局的他人」作为目标。
 *
 * 代价校验一律「警告 + 允许」，不做硬拦截：结算层的代价扣减本来就不设下限，
 * 硬拦截会在「付得起的牌不足 2 张」时把对局彻底卡死。
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { CardTile } from '@/components/CardTile'
import { NeutralBidPanel } from './NeutralBidPanel'
import { FACTION_MAP } from '@/mocks/factions'
import { useRoomStore } from '@/store/roomStore'
import { STAT_KEYS, canAfford, costShortage, totalCost } from '@/utils/game/cost'
import { AXIS_LABEL, STAT_LABEL } from '@/utils/format'
import type { Bid, CardDef, NeutralPointDef } from '@/types'
import type {
  ClientMessage,
  DesignatedAction,
  PublicPlayer,
  SelfView,
} from '@/shared/protocol'

/** 交给 roomStore.submitPick 的载荷（就是协议里 submitPick 去掉 type 字段） */
export type SubmitPickInput = Omit<Extract<ClientMessage, { type: 'submitPick' }>, 'type'>

/**
 * 指定牌处置方式。五种互斥选项，对应到协议里的 { play, keep } 时永远只填一边，
 * 因为服务端明确禁止 play 与 keep 同时非空。
 */
type DesignatedChoice = 'play-new' | 'keep-new' | 'play-held' | 'keep-held' | 'discard-both'

/** 某个处置选项在当前手牌下是否成立 */
function isChoiceAvailable(
  choice: DesignatedChoice,
  hasHeld: boolean,
  hasOffered: boolean,
): boolean {
  switch (choice) {
    case 'play-held':
    case 'keep-held':
      return hasHeld
    case 'play-new':
    case 'keep-new':
      return hasOffered
    case 'discard-both':
      return true
    default:
      return false
  }
}

/** 本地选项 → 协议字段。null 与「全部弃置」都表示不打出、不保留 */
function toDesignated(choice: DesignatedChoice | null): DesignatedAction {
  switch (choice) {
    case 'play-new':
      return { play: 'new', keep: null }
    case 'keep-new':
      return { play: null, keep: 'new' }
    case 'play-held':
      return { play: 'held', keep: null }
    case 'keep-held':
      return { play: null, keep: 'held' }
    default:
      return { play: null, keep: null }
  }
}

interface ChoiceButton {
  key: DesignatedChoice
  label: string
  disabled?: boolean
}

interface Props {
  self: SelfView
  /** 脱敏后的公开玩家列表：没有手牌、没有胜利条件 */
  players: PublicPlayer[]
  round: number
  /** 服务端每一次报错都会让它自增，用于解除「已发出」的本地锁 */
  rejectTick: number
  /** 本回合可争夺的中立资源点 */
  neutralPoints: NeutralPointDef[]
  /** 我此前提交过的出价（重连回显） */
  myBid: Bid | null
  /** 已出价人数，仅用于提示 */
  bidCount: number
  onSubmit: (input: SubmitPickInput) => void
}

export function PickingPanel({
  self,
  players,
  round,
  rejectTick,
  neutralPoints,
  myBid,
  bidCount,
  onSubmit,
}: Props) {
  /** 当前操作者。联机模式下恒定不变；本地热座模式下切换操作者会变，用于重置表单 */
  const playerId = useRoomStore((s) => s.playerId)
  const actions = self.hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC')
  const neutral = self.hand.find((c) => c.category === 'action' && c.owner === 'GENERIC') ?? null
  const offered = self.hand.find((c) => c.category === 'designated') ?? null
  const held = self.heldDesignated
  const hasHeld = Boolean(held)
  const hasOffered = Boolean(offered)
  const neutralPlayable = neutral ? canAfford(neutral, self.stats) : false

  const [selected, setSelected] = useState<string[]>([])
  const [choice, setChoice] = useState<DesignatedChoice | null>(() => {
    // 流亡者只能保留（打出去也不生效，服务端会直接拒绝），默认替玩家选好
    if (!self.exiled) return null
    if (self.heldDesignated) return 'keep-held'
    if (self.hand.some((c) => c.category === 'designated')) return 'keep-new'
    return null
  })
  // 中立援助默认接受；代价付不起时默认拒绝，避免玩家在不知情时被扣崩
  const [neutralAccept, setNeutralAccept] = useState(neutralPlayable)
  const [targetId, setTargetId] = useState('')
  /** 中立资源出价；null = 不参与 */
  const [bid, setBid] = useState<{ pointId: string; amount: number } | null>(
    myBid && myBid.pointId ? { pointId: myBid.pointId, amount: myBid.amount } : null,
  )
  const [sent, setSent] = useState(false)
  /** 我是否已经真的发出过提交（用于区分「我被拒」和「别人被拒」的报错） */
  const sentRef = useRef(false)
  /** 我这一次提交被服务端拒绝过，用于给出明确的重试提示 */
  const [rejectedOnce, setRejectedOnce] = useState(false)

  // 服务端报错（rejectTick 增长）→ 解除本地锁，允许玩家调整后重新提交。
  // 只有「我确实提交过」时才提示被拒，别人的操作报错不该弹到我脸上。
  useEffect(() => {
    if (rejectTick > 0 && sentRef.current) {
      sentRef.current = false
      setSent(false)
      setRejectedOnce(true)
    }
  }, [rejectTick])

  /** 已经提交且服务器没有回错误：按钮置灰等快照 */
  const blocked = sent

  // 切换操作者（本地热座）时，上一个人的选牌、目标、提交标记全部作废。
  // 不重置的话，下一个人会看到上一个人选好的牌，热座就退化成「替别人选」了。
  useEffect(() => {
    setSelected([])
    setSent(false)
    sentRef.current = false
    setRejectedOnce(false)
    setTargetId('')
    setNeutralAccept(neutralPlayable)
    setBid(myBid && myBid.pointId ? { pointId: myBid.pointId, amount: myBid.amount } : null)
    // 指定牌处置的默认值也因人而异（流亡者只能保留），必须按新操作者重算
    setChoice(() => {
      if (!self.exiled) return null
      if (self.heldDesignated) return 'keep-held'
      if (self.hand.some((c) => c.category === 'designated')) return 'keep-new'
      return null
    })
    // self 的字段随操作者变化，作为依赖会引发频繁重置，故只依赖 playerId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, neutralPlayable])

  const toggle = (card: CardDef) => {
    // 代价不足的牌同样可选：结算时照扣，扣成负数由回合末的崩溃判定处理
    setSelected((prev) => {
      if (prev.includes(card.id)) return prev.filter((id) => id !== card.id)
      if (prev.length >= 2) return prev
      return [...prev, card.id]
    })
  }

  const selectedCards = actions.filter((c) => selected.includes(c.id))
  const willPlayNeutral = Boolean(neutral && neutralPlayable && neutralAccept)
  const needsChoice = hasHeld || hasOffered
  const playedCard = choice === 'play-new' ? offered : choice === 'play-held' ? held : null

  // 目标：任意其他未出局玩家（服务端只接受「未出局的他人」）
  const targets = players.filter((p) => p.id !== self.id && !p.defeated)
  const targetValid = !playedCard || targets.some((t) => t.id === targetId)

  const choiceValid =
    !needsChoice ||
    (choice !== null &&
      isChoiceAvailable(choice, hasHeld, hasOffered) &&
      // 流亡者打不出指定牌，服务端会整单拒绝，界面上直接判为不可提交
      !(self.exiled && playedCard))

  // 合计代价检查：不阻止提交，但明确告知后果
  const plannedCards = [...selectedCards, ...(willPlayNeutral && neutral ? [neutral] : [])]
  const combo = totalCost(plannedCards)
  const comboOver = STAT_KEYS.filter((k) => (combo[k] ?? 0) > self.stats[k]).map((k) => ({
    key: k,
    over: (combo[k] ?? 0) - self.stats[k],
  }))

  const canSubmit =
    selectedCards.length === 2 && choiceValid && targetValid && !blocked && !self.defeated

  const submitHint =
    self.defeated
      ? '你已出局，本回合无需提交。'
      : selectedCards.length !== 2
        ? actions.length < 2
          ? '本回合可用的行动牌不足 2 张。'
          : '请先选满 2 张行动牌。'
        : !choiceValid
          ? '请选择指定牌的处理方式。'
          : !targetValid
            ? '请选择一位目标玩家。'
            : ''

  /**
   * 上回合保留的指定牌是否已经用完「保留一回合」的额度。
   *
   * 规则：指定牌只能保留一回合，到下一回合必须打出或弃置；
   * 流亡期间例外，可以一直留着。额度用尽时必须禁用「继续保留」按钮，
   * 否则玩家点了会被服务端拒绝，白跑一次提交。
   */
  const heldKeepExhausted = Boolean(
    hasHeld &&
      !self.exiled &&
      self.heldKeptRound !== null &&
      self.heldKeptRound !== undefined &&
      self.heldKeptRound < round,
  )

  const choiceButtons: ChoiceButton[] = []
  if (hasHeld && hasOffered) {
    choiceButtons.push(
      { key: 'play-held', label: '打出上回合保留的牌（本回合新牌弃置）', disabled: self.exiled },
      { key: 'play-new', label: '打出本回合新牌（保留牌弃置）', disabled: self.exiled },
      {
        key: 'keep-held',
        label: heldKeepExhausted ? '保留上回合的牌（已超一回合，不可选）' : '保留上回合的牌（本回合新牌弃置）',
        disabled: heldKeepExhausted,
      },
      { key: 'keep-new', label: '保留本回合新牌（保留牌弃置）' },
      { key: 'discard-both', label: '两张都不留' },
    )
  } else if (hasHeld) {
    choiceButtons.push(
      { key: 'play-held', label: '打出保留的指定牌', disabled: self.exiled },
      {
        key: 'keep-held',
        label: heldKeepExhausted ? '继续保留（已超一回合，不可选）' : '继续保留到下一回合',
        disabled: heldKeepExhausted,
      },
      { key: 'discard-both', label: '弃置这张指定牌' },
    )
  } else if (hasOffered) {
    choiceButtons.push(
      { key: 'play-new', label: '打出指定牌（需要选目标）', disabled: self.exiled },
      { key: 'keep-new', label: '保留到下一回合' },
      { key: 'discard-both', label: '弃置这张指定牌' },
    )
  }

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      actionCardIds: selectedCards.map((c) => c.id),
      neutralAccept: willPlayNeutral,
      // 没有可处置的指定牌时一律传空，避免残留的本地选项被服务端判为「没有这张牌」
      designated: needsChoice ? toDesignated(choice) : { play: null, keep: null },
      targetId: playedCard ? targetId : null,
      bid: bid && bid.pointId ? { pointId: bid.pointId, amount: bid.amount } : null,
    })
    setRejectedOnce(false)
    sentRef.current = true
    setSent(true)
  }

  const targetIsAlly = Boolean(
    targetId &&
      (self.allyId === targetId || players.some((p) => p.id === targetId && p.allyId === self.id)),
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-900/50 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            第 {round} 回合 · 四人并行暗选
          </p>
          <p className="font-display text-lg text-slate-100">轮到你选牌</p>
        </div>
        <p className="max-w-md text-[11px] leading-relaxed text-slate-500">
          这份手牌只有你自己能看到。提交后不可撤回，四人全部提交后自动进入盟约窗口。
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs text-slate-400">
          行动牌 3 选 2：三张牌的战略轴互不相同，按当前局势取舍。
          <span className="text-slate-500">代价不足的牌会标红，仍然可以打——只是会透支。</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {actions.map((card) => {
            const gap = costShortage(card, self.stats)
            return (
              <CardTile
                key={card.id}
                card={card}
                selected={selected.includes(card.id)}
                disabled={!selected.includes(card.id) && selected.length >= 2}
                warning={gap ? `代价不足（${gap}）：打出会透支，结算时可能当场崩溃` : undefined}
                onClick={() => toggle(card)}
                testId="action-card"
              />
            )
          })}
        </div>
        {actions.length === 0 && (
          <p className="text-[11px] text-slate-500">本回合没有发到行动牌。</p>
        )}
        {selected.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-300">
            已选 {selected.length} / 2：
            {selectedCards
              .map((c) => `${c.name}（${c.axis ? AXIS_LABEL[c.axis] : '行动'}）`)
              .join('、')}
          </p>
        )}
        {comboOver.length > 0 && (
          <p className="mt-2 rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] leading-relaxed text-rose-200">
            ⚠ 合计代价超出当前数值：
            {comboOver.map((o) => `${STAT_LABEL[o.key]}超出 ${o.over}`).join('、')}
            —— 结算时会把该项扣成负数，很可能当场崩溃。确认你要这么打。
          </p>
        )}
      </div>

      <NeutralBidPanel
        points={neutralPoints}
        myBid={myBid}
        bidCount={bidCount}
        supply={self.stats.supply}
        blocked={blocked}
        onChange={setBid}
      />

      {neutral && (
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
          <p className="mb-2 text-xs text-slate-400">中立援助（随机分配，有失败风险）</p>
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-full sm:w-64">
              <CardTile
                card={neutral}
                compact
                warning={
                  costShortage(neutral, self.stats)
                    ? `代价不足（${costShortage(neutral, self.stats)}）`
                    : undefined
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant={neutralAccept && neutralPlayable ? 'primary' : 'ghost'}
                disabled={!neutralPlayable || blocked}
                onClick={() => setNeutralAccept(true)}
              >
                接受中立援助
              </Button>
              <Button
                variant={!neutralAccept ? 'primary' : 'ghost'}
                disabled={blocked}
                onClick={() => setNeutralAccept(false)}
              >
                拒绝中立援助
              </Button>
              <p className="text-[10px] text-slate-500">
                当前：
                {!neutralPlayable ? '代价不足，无法接受' : neutralAccept ? '接受，本回合打出' : '拒绝，直接弃置'}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">
            中立援助不占 2 张行动牌名额；若概率失败会带来轻度负面后果。
          </p>
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="mb-2 text-xs text-slate-400">指定牌：对某个阵营发起行动，需选择目标</p>
        {(hasHeld || hasOffered) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {held && (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500">上回合保留的指定牌</p>
                <CardTile card={held} compact />
              </div>
            )}
            {offered && (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500">本回合发放的指定牌</p>
                <CardTile card={offered} compact />
              </div>
            )}
          </div>
        )}
        {!hasHeld && !hasOffered && (
          <p className="text-[11px] text-slate-600">本回合没有可处置的指定牌。</p>
        )}

        {self.exiled && (
          <p className="mt-2 rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] leading-relaxed text-amber-200">
            你处于流亡状态：本回合不能主动针对他人，指定牌打出去也不会生效，因此只能保留或弃置。
            <span className="mt-1 block text-amber-300/80">
              流亡期间不受「只能保留一回合」的限制，可以一直留着这张牌。
            </span>
          </p>
        )}

        {heldKeepExhausted && (
          <p
            className="mt-2 rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] leading-relaxed text-rose-200"
            data-testid="held-keep-exhausted"
          >
            上回合保留的指定牌已经留满一回合，这回合必须打出或弃置，不能再继续保留。
          </p>
        )}

        {choiceButtons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {choiceButtons.map((b) => (
              <Button
                key={b.key}
                variant={choice === b.key ? 'primary' : 'ghost'}
                disabled={b.disabled || blocked}
                onClick={() => setChoice(b.key)}
                data-testid={`designated-${b.key}`}
              >
                {b.label}
              </Button>
            ))}
          </div>
        )}

        {playedCard && (
          <div className="mt-3 rounded border border-white/10 bg-slate-950/50 p-3">
            <p className="text-[11px] text-slate-300">
              「{playedCard.name}」目标：任意其他未出局玩家（含盟友）
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {targets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => setTargetId(p.id)}
                  className={`rounded border px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                    targetId === p.id
                      ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                      : 'border-white/15 bg-slate-900 text-slate-300 hover:border-white/40'
                  }`}
                >
                  {p.name}（{FACTION_MAP[p.factionId].name}）
                </button>
              ))}
              {targets.length === 0 && (
                <p className="text-[11px] text-slate-500">当前没有可指定的目标玩家。</p>
              )}
            </div>
            {targetIsAlly && <p className="mt-1 text-[10px] text-amber-300">目标为盟友，请确认。</p>}
            {!targetValid && (
              <p className="mt-1 text-[10px] text-amber-300">请选择一位合法目标后才能提交。</p>
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              命中与反噬效果见上方牌面。目标打出免疫 / 调停等防御牌时会被挡下。
            </p>
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-600">
          指定牌最多保留一回合；保留则本回合不结算指定牌效果。
        </p>
      </div>

      <Button full disabled={!canSubmit} onClick={handleSubmit} data-testid="submit-pick">
        {blocked ? '已提交，等待其他玩家…' : '确认提交（提交后不可撤回）'}
      </Button>
      {rejectedOnce && !blocked && (
        <p className="text-center text-[11px] text-rose-300">
          上一次提交没有被服务器接受，请调整后重新提交。
        </p>
      )}
      {!canSubmit && submitHint && (
        <p className="text-center text-[11px] text-amber-300">{submitHint}</p>
      )}
      {blocked && (
        <p className="text-center text-[10px] text-slate-500">
          选牌已发出，正在等待服务器快照与其他玩家。
        </p>
      )}
    </section>
  )
}

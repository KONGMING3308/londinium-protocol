/**
 * 暗选面板：行动牌 3 选 2 + 中立援助打出/弃置 + 指定牌处置与目标选择
 */
import { useState } from 'react'
import { Button } from '@/components/Button'
import { CardTile } from '@/components/CardTile'
import { FactionPanel } from '@/components/FactionPanel'
import { FACTION_MAP } from '@/mocks/factions'
import { validTargets } from '@/utils/game/resolve'
import { AXIS_LABEL, OP_HIT, OP_LABEL, effectText } from '@/utils/format'
import type { CardDef, PlayerState } from '@/types'

type DesignatedChoice = 'play-held' | 'play-new' | 'keep-new' | 'discard-held'

interface Props {
  player: PlayerState
  players: PlayerState[]
  hand: CardDef[]
  round: number
  onSubmit: (cards: CardDef[], played: CardDef | null, kept: CardDef | null, targetId: string | null) => void
}

export function PickingPanel({ player, players, hand, round, onSubmit }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [choice, setChoice] = useState<DesignatedChoice | null>(null)
  const [targetId, setTargetId] = useState('')
  const [neutralKept, setNeutralKept] = useState(true)
  const held = player.heldDesignated

  const actions = hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC')
  const neutral = hand.find((c) => c.category === 'action' && c.owner === 'GENERIC') ?? null
  const offered = hand.find((c) => c.category === 'designated') ?? null

  const toggle = (card: CardDef) => {
    setSelected((prev) => {
      if (prev.includes(card.id)) return prev.filter((id) => id !== card.id)
      if (prev.length >= 2) return prev
      return [...prev, card.id]
    })
  }

  const selectedCards = actions.filter((c) => selected.includes(c.id))
  const playedCard =
    choice === 'play-held' ? held : choice === 'keep-new' ? null : offered
  const targets = playedCard ? validTargets(player, players, 'any') : []
  const scopeLabel = '任意阵营（含盟友）'
  const targetValid = !playedCard || targets.some((t) => t.id === targetId)
  const needsChoice = Boolean(offered || held)
  const choiceValid = !needsChoice || choice !== null
  const canSubmit = selectedCards.length === 2 && choiceValid && targetValid
  const submitHint =
    selectedCards.length !== 2
      ? '请先选满 2 张行动牌'
      : !choiceValid
        ? '请选择指定牌处理方式'
        : !targetValid
          ? '请选择目标玩家'
          : ''
  const targetIsAlly = Boolean(
    targetId &&
      (player.allyId === targetId || players.some((p) => p.id === targetId && p.allyId === player.id)),
  )

  const handleSubmit = () => {
    if (!canSubmit) return
    let played: CardDef | null = null
    let kept: CardDef | null = null
    if (choice === 'play-held' && held) {
      played = held
      kept = offered
    } else if (choice === 'play-new') {
      played = offered
    } else if (choice === 'keep-new') {
      kept = offered
    } else if (choice === 'discard-held') {
      played = offered
    }
    const cards = [...selectedCards, ...(neutralKept && neutral ? [neutral] : [])]
    onSubmit(cards, played, kept, played ? targetId : null)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-900/50 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">第 {round} / 7 回合 · 当前操作者</p>
          <p className="font-display text-lg text-slate-100">{player.name}</p>
        </div>
        <div className="w-56">
          <FactionPanel player={player} compact />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-slate-400">
          行动牌 3 选 2：三张牌的战略轴互不相同，按当前局势取舍。
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {actions.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              selected={selected.includes(card.id)}
              disabled={!selected.includes(card.id) && selected.length >= 2}
              onClick={() => toggle(card)}
            />
          ))}
        </div>
        {selected.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-300">
            已选 {selected.length} / 2：{selectedCards.map((c) => `${c.name}（${c.axis ? AXIS_LABEL[c.axis] : '行动'}）`).join('、')}
          </p>
        )}
      </div>

      {neutral && (
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
          <p className="mb-2 text-xs text-slate-400">中立援助（随机分配，有失败风险）</p>
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-full sm:w-64">
              <CardTile card={neutral} compact />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant={neutralKept ? 'primary' : 'ghost'}
                onClick={() => setNeutralKept(true)}
              >
                接受中立援助
              </Button>
              <Button
                variant={neutralKept ? 'ghost' : 'primary'}
                onClick={() => setNeutralKept(false)}
              >
                拒绝中立援助
              </Button>
              <p className="text-[10px] text-slate-500">
                当前：{neutralKept ? '接受，本回合打出' : '拒绝，直接弃置'}
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
        {(held || offered) && (
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
        {!held && !offered && (
          <p className="text-[11px] text-slate-600">本回合没有可处置的指定牌。</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {held ? (
            <>
              <Button variant={choice === 'play-held' ? 'primary' : 'ghost'} onClick={() => setChoice('play-held')}>
                打出保留的指定牌，新牌留存
              </Button>
              <Button variant={choice === 'discard-held' ? 'primary' : 'ghost'} onClick={() => setChoice('discard-held')}>
                弃置保留的指定牌，打出新牌
              </Button>
            </>
          ) : (
            offered && (
              <>
                <Button variant={choice === 'play-new' ? 'primary' : 'ghost'} onClick={() => setChoice('play-new')}>
                  打出指定牌
                </Button>
                <Button variant={choice === 'keep-new' ? 'primary' : 'ghost'} onClick={() => setChoice('keep-new')}>
                  保留到下一回合
                </Button>
              </>
            )
          )}
        </div>

        {playedCard && (
          <div className="mt-3 rounded border border-white/10 bg-slate-950/50 p-3">
            <p className="text-[11px] text-slate-300">
              「{playedCard.name}」目标：{scopeLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {targets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTargetId(p.id)}
                  className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                    targetId === p.id
                      ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                      : 'border-white/15 bg-slate-900 text-slate-300 hover:border-white/40'
                  }`}
                >
                  {p.name}（{FACTION_MAP[p.factionId].name}）
                </button>
              ))}
            </div>
            {targetIsAlly && (
              <p className="mt-1 text-[10px] text-amber-300">目标为盟友，请确认。</p>
            )}
            {playedCard.op && (
              <p className="mt-2 text-[10px] leading-relaxed text-emerald-300">
                {OP_LABEL[playedCard.op]}命中 → {OP_HIT[playedCard.op]}
              </p>
            )}
            {playedCard.backlash && (
              <p className="mt-1 text-[10px] text-rose-300">
                落空 ← 反噬 {effectText(playedCard.backlash)}（目标可用免疫/调停等防御牌挡下）
              </p>
            )}
            {!targetValid && <p className="mt-1 text-[10px] text-amber-300">请选择一位合法目标后才能提交。</p>}
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-600">
          指定牌最多保留一回合；保留则本回合不结算指定牌效果。
        </p>
      </div>

      <Button full disabled={!canSubmit} onClick={handleSubmit}>
        确认选择并交给下一位
      </Button>
      {!canSubmit && <p className="text-center text-[11px] text-amber-300">{submitHint}</p>}
    </section>
  )
}

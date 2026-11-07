import type { CardDef } from '@/types'
import { FACTION_MAP } from '@/mocks/factions'
import { AXIS_COLOR, AXIS_LABEL, OP_HIT, OP_LABEL, STAT_LABEL, costText, effectText } from '@/utils/format'

interface Props {
  card: CardDef
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  compact?: boolean
  /** 额外提示（如「代价不足」），显示为红色警示行 */
  warning?: string
  /** 自动化测试锚点（浏览器端到端测试用），不影响视觉 */
  testId?: string
}

export function CardTile({ card, selected, disabled, onClick, compact, warning, testId }: Props) {
  const designated = card.category === 'designated'
  const faction = card.category === 'faction'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`group relative w-full rounded-lg border p-3 text-left transition-all ${
        selected
          ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.4)]'
          : faction
            ? 'border-fuchsia-400/40 bg-fuchsia-500/5 hover:border-fuchsia-300/60'
            : 'border-white/10 bg-slate-900/60 hover:border-white/30'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-1.5">
        <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'} text-slate-100`}>{card.name}</span>
        <span className="flex flex-wrap gap-1">
          {faction && (
            <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] text-fuchsia-200">
              阵营牌
            </span>
          )}
          {card.axis && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${AXIS_COLOR[card.axis]}`}>
              {AXIS_LABEL[card.axis]}
            </span>
          )}
          {card.op && (
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-200">
              {OP_LABEL[card.op]}
            </span>
          )}
          {card.tag && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
              {card.tag}
            </span>
          )}
        </span>
      </div>

      {!compact && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{card.text}</p>}

      {card.cost && <p className="mt-2 text-[10px] text-rose-300">代价：{costText(card.cost)}</p>}
      {faction ? (
        <div className="mt-2 space-y-1">
          {([0, 1] as const).map((i) => {
            const fid = card.pair?.[i]
            const eff = (i === 0 ? card.effects : card.allyEffects) ?? {}
            const rows = (['manpower', 'supply', 'morale'] as const)
              .map((k) => [k, eff[k] ?? 0] as [keyof typeof STAT_LABEL, number])
              .filter(([, v]) => v !== 0)
            const give = rows.filter(([, v]) => v < 0)
            const gain = rows.filter(([, v]) => v > 0)
            return (
              <div
                key={i}
                className="rounded border border-white/5 bg-slate-950/40 px-1.5 py-1 text-[10px] leading-relaxed"
              >
                <span className={i === 0 ? 'text-emerald-300' : 'text-sky-300'}>
                  {fid ? FACTION_MAP[fid].name : '—'}
                </span>
                <span className="ml-1 text-slate-400">
                  {give.length > 0 && (
                    <span className="text-rose-300/90">
                      付出 {give.map(([k, v]) => `${STAT_LABEL[k]}${v}`).join('、')}
                    </span>
                  )}
                  {give.length > 0 && gain.length > 0 && <span className="text-slate-600"> ｜ </span>}
                  {gain.length > 0 && (
                    <span className="text-emerald-300/90">
                      获得 {gain.map(([k, v]) => `${STAT_LABEL[k]}+${v}`).join('、')}
                    </span>
                  )}
                  {rows.length === 0 && <span className="text-slate-600">无变化</span>}
                </span>
              </div>
            )
          })}
          <p className="pt-0.5 text-[10px] text-slate-600">
            这牌是两人互换：一方给出的，正好是另一方拿到的。
          </p>
        </div>
      ) : (
        card.axis &&
        effectText(card.effects) && (
          <p className="mt-1 font-mono text-[11px] text-emerald-300">{effectText(card.effects)}</p>
        )
      )}
      {card.requiresAlly && <p className="mt-1 text-[10px] text-amber-300">需要处于同盟，否则无效</p>}
      {card.roll && (
        <p className="mt-1 text-[10px] text-fuchsia-300">
          {Math.round(card.roll.chance * 100)}% 成功：{effectText(card.roll.win)}｜失败：{effectText(card.roll.lose)}
        </p>
      )}

      {designated && card.op && (
        <p className="mt-2 text-[10px] leading-relaxed text-emerald-300">
          {card.hitText ?? `命中 → ${OP_HIT[card.op]}`}
        </p>
      )}
      {designated && effectText(card.effects) && (
        <p className="mt-1 text-[10px] text-emerald-300">命中额外：{effectText(card.effects)}</p>
      )}
      {card.counterTag && (
        <p className="mt-1 text-[10px] text-rose-300">针对【{card.counterTag}】</p>
      )}
      {card.backlash && (
        <p className="mt-1 text-[10px] leading-relaxed text-rose-300">
          被挡下 / 无合法目标 → 反噬 {effectText(card.backlash)}
        </p>
      )}
      {card.progress ? (
        <p className="mt-1 text-[10px] text-rose-300">
          {faction && card.pair?.[0]
            ? `${FACTION_MAP[card.pair[0]].name} `
            : card.owner !== 'GENERIC'
              ? `${FACTION_MAP[card.owner].name} `
              : ''}
          战争进度 +{card.progress}
        </p>
      ) : null}
      {card.allyProgress ? (
        <p className="mt-1 text-[10px] text-rose-300">
          {faction && card.pair?.[1] ? `${FACTION_MAP[card.pair[1]].name} ` : ''}战争进度 +{card.allyProgress}
        </p>
      ) : null}
      {card.tag && (
        <p className="mt-1 text-[10px] leading-relaxed text-amber-200/80">
          KEY【{card.tag}】· 打出当回合可能被「针对{card.tag}」击穿
        </p>
      )}

      {warning && (
        <p className="mt-1.5 rounded border border-rose-400/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-200">
          ⚠ {warning}
        </p>
      )}
    </button>
  )
}

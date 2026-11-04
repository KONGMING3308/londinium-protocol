import { ROUND_MODIFIERS } from '@/mocks'
import { formatRound } from '@/utils/format'

interface Props {
  current: number
}

export function RoundTimeline({ current }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROUND_MODIFIERS.map((m) => {
        const active = m.round === current
        const done = m.round < current
        return (
          <div
            key={m.round}
            className={`rounded px-2 py-1 text-[11px] ${
              active
                ? 'bg-amber-400 text-slate-950'
                : done
                  ? 'bg-white/10 text-slate-400'
                  : 'bg-white/5 text-slate-600'
            }`}
            title={m.story}
          >
            {formatRound(m.round)} {m.label}
          </div>
        )
      })}
    </div>
  )
}

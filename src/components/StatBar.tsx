import type { Stats } from '@/types'
import { STAT_COLOR, STAT_LABEL } from '@/utils/format'

interface Props {
  stats: Stats
  compact?: boolean
  max?: number
}

export function StatBar({ stats, compact, max = 50 }: Props) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {(['manpower', 'supply', 'morale'] as const).map((key) => {
        const value = stats[key]
        const pct = Math.min(100, Math.max(0, (value / max) * 100))
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-[11px] text-slate-400">{STAT_LABEL[key]}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full ${STAT_COLOR[key]}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-7 shrink-0 text-right font-mono text-xs text-slate-200">{value}</span>
          </div>
        )
      })}
    </div>
  )
}

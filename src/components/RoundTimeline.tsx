import { ROUND_THEMES } from '@/mocks'
import { formatRound } from '@/utils/format'

interface Props {
  current: number
}

/**
 * 回合时间轴：七回合各自的主题名。
 *
 * 这里只显示「大背景」（潜入 / 撤离 / 夺剑 …），不显示数值。
 * 每回合真正生效的剧情事件是随机抽的，显示在回合页顶部的剧情卡上，
 * 时间轴如果把随机事件也画进来，会出现「同一回合不同局显示不同内容」，
 * 反而让人误以为是固定的。
 */
export function RoundTimeline({ current }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROUND_THEMES.map((m) => {
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
          >
            {formatRound(m.round)} {m.label}
          </div>
        )
      })}
    </div>
  )
}

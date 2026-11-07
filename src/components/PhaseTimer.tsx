/**
 * 阶段倒计时条。
 *
 * 显示「还剩多少秒 + 进度条」，并说明超时会自动代操作——
 * 让玩家知道系统不会因为有人发呆而卡死，也提醒别拖到最后。
 *
 * 这个组件只负责「看」。到点后什么都不做，等服务器推快照。
 */
import { Clock, TimerOff } from 'lucide-react'
import { formatRemaining, useCountdown } from './useCountdown'

interface Props {
  /** 服务端给的截止时间戳；null = 本阶段不计时 */
  deadline: number | null | undefined
  /** 本阶段总时长；null = 本阶段不计时 */
  duration: number | null | undefined
  /** 这一阶段超时后会发生什么（给玩家看的说明） */
  timeoutHint?: string
}

export function PhaseTimer({ deadline, duration, timeoutHint }: Props) {
  const { remaining, ratio, expired } = useCountdown(deadline, duration)

  // 不计时的阶段（大厅 / 结算 / 终局）不占版面
  if (remaining === null || ratio === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
        <TimerOff className="h-3 w-3" />
        本阶段不计时
      </span>
    )
  }

  // 剩余 25% 以下变红，给人紧迫感但不喧宾夺主
  const urgent = ratio <= 0.25
  const tone = expired
    ? 'text-slate-400 border-slate-500/40 bg-slate-500/10'
    : urgent
      ? 'text-rose-200 border-rose-400/40 bg-rose-500/10'
      : 'text-sky-200 border-sky-400/30 bg-sky-500/10'

  const barTone = expired
    ? 'bg-slate-500'
    : urgent
      ? 'bg-rose-400'
      : ratio <= 0.5
        ? 'bg-amber-400'
        : 'bg-sky-400'

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${tone}`}
      data-testid="phase-timer"
      data-remaining={remaining}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <Clock className="h-3.5 w-3.5" />
          {expired ? '时间到，正在自动处理…' : `剩余 ${formatRemaining(remaining)}`}
        </span>
        {timeoutHint && (
          <span className="text-[10px] opacity-70" title={timeoutHint}>
            超时自动处理
          </span>
        )}
      </div>
      {/* 进度条：宽度就是剩余占比 */}
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/30">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${barTone}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      {timeoutHint && <p className="mt-1 text-[10px] leading-relaxed opacity-70">{timeoutHint}</p>}
    </div>
  )
}

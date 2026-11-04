import type { LogEntry } from '@/types'

interface Props {
  logs: LogEntry[]
  limit?: number
}

export function LogList({ logs, limit }: Props) {
  const shown = limit ? logs.slice(-limit) : logs
  return (
    <div className="space-y-1.5">
      {shown.length === 0 && <p className="text-xs text-slate-500">暂无记录</p>}
      {shown.map((log, i) => (
        <p
          key={`${log.round}-${i}`}
          className={`rounded border-l-2 px-2 py-1 text-[11px] leading-relaxed ${
            log.tone === 'counter'
              ? 'border-rose-400 bg-rose-500/10 text-rose-200'
              : log.tone === 'good'
                ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                : log.tone === 'bad'
                  ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                  : log.tone === 'pact'
                    ? 'border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-200'
                    : 'border-white/20 bg-white/5 text-slate-300'
          }`}
        >
          <span className="mr-1 font-mono text-[10px] opacity-60">R{log.round}</span>
          {log.text}
        </p>
      ))}
    </div>
  )
}

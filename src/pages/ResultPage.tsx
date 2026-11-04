import { useNavigate } from 'react-router-dom'
import { FACTION_MAP } from '@/mocks/factions'
import { useGameStore } from '@/store/gameStore'
import { Button } from '@/components/Button'
import { FactionPanel } from '@/components/FactionPanel'

export function ResultPage() {
  const game = useGameStore((s) => s.game)
  const reset = useGameStore((s) => s.reset)
  const navigate = useNavigate()

  if (!game) return null

  const ranked = [...game.players].sort((a, b) => {
    const sum = (p: typeof a) => p.score + p.stats.manpower + p.stats.supply + p.stats.morale
    return sum(b) - sum(a)
  })
  const winner = game.winner ? FACTION_MAP[game.winner] : null

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-transparent p-6 text-center">
        <p className="text-[10px] uppercase tracking-[0.35em] text-amber-400/80">Final Report</p>
        {winner ? (
          <>
            <h2 className="font-display text-3xl text-amber-100">{winner.name}</h2>
            <p className="mt-1 text-sm text-amber-200/80">{winner.title}</p>
            <p className="mt-3 text-sm text-slate-300">{game.winnerReason}</p>
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl text-slate-200">无人获胜</h2>
            <p className="mt-2 text-sm text-slate-400">七回合结束，没有任何阵营达成自己的目标。</p>
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ranked.map((p, i) => (
          <div key={p.id} className="relative">
            <span className="absolute -left-1 top-2 z-10 rounded bg-slate-950 px-1.5 text-[10px] text-slate-500">
              #{i + 1}
            </span>
            <FactionPanel player={p} />
            <p className="mt-1 px-1 text-[10px] text-slate-500">
              战绩分 {p.score} · 终局总和 {p.stats.manpower + p.stats.supply + p.stats.morale}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="mb-2 text-xs text-slate-400">终局日志</p>
        <p className="text-[11px] leading-relaxed text-slate-400">
          {[...game.log, ...game.roundLog].slice(-6).map((l) => l.text).join(' ')}
        </p>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={() => {
            reset()
            navigate('/')
          }}
        >
          再来一局
        </Button>
      </div>
    </section>
  )
}

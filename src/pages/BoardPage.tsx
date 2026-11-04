import { FACTION_MAP } from '@/mocks/factions'
import { useGameStore } from '@/store/gameStore'
import { FactionPanel } from '@/components/FactionPanel'
import { LogList } from '@/components/LogList'
import { RoundTimeline } from '@/components/RoundTimeline'
import { Button } from '@/components/Button'

export function BoardPage() {
  const game = useGameStore((s) => s.game)
  if (!game) return null

  return (
    <section className="space-y-4">
      <RoundTimeline current={game.round} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {game.players.map((p) => (
          <div key={p.id} className="space-y-1">
            <FactionPanel player={p} />
            <p className="px-1 text-[10px] text-slate-500">{FACTION_MAP[p.factionId].victory.title}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="mb-2 text-xs text-slate-400">完整日志</p>
        <LogList logs={[...game.log, ...game.roundLog]} limit={40} />
      </div>

      <Button variant="ghost" onClick={() => undefined} disabled>
        当前为第 {game.round} 回合
      </Button>
    </section>
  )
}

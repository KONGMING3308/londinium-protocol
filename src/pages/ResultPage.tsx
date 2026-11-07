import { useNavigate } from 'react-router-dom'
import { FACTION_MAP } from '@/mocks/factions'
import { useRoomStore } from '@/store/roomStore'
import { Button } from '@/components/Button'
import { FactionPanel } from '@/components/FactionPanel'
import type { PublicPlayer } from '@/shared/protocol'
import type { PlayerState } from '@/types'

/**
 * 端局页拿到的是「公开玩家信息」（没有 heldDesignated）。
 * FactionPanel 需要完整 PlayerState 形状，这里补一个 null 占位；
 * 端局页本来也不需要展示「还剩哪张保留牌」。
 */
function asPlayer(p: PublicPlayer): PlayerState {
  return { ...p, heldDesignated: null, heldKeptRound: null }
}

export function ResultPage() {
  const match = useRoomStore((s) => s.match)
  const playerId = useRoomStore((s) => s.playerId)
  const leaveRoom = useRoomStore((s) => s.leaveRoom)
  const navigate = useNavigate()

  if (!match) return null

  const ranked = [...match.players].sort((a, b) => {
    const sum = (p: PublicPlayer) => p.stats.manpower + p.stats.supply + p.stats.morale
    return sum(b) - sum(a)
  })
  const winner = match.winner ? FACTION_MAP[match.winner] : null
  const iWon = Boolean(match.winner && match.winner === match.self.factionId)

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-transparent p-6 text-center">
        <p className="text-[10px] uppercase tracking-[0.35em] text-amber-400/80">Final Report</p>
        {winner ? (
          <>
            <h2 className="font-display text-3xl text-amber-100">{winner.name}</h2>
            <p className="mt-1 text-sm text-amber-200/80">{winner.title}</p>
            <p className="mt-3 text-sm text-slate-300">{match.winnerReason}</p>
            <p className={`mt-2 text-xs ${iWon ? 'text-emerald-300' : 'text-slate-400'}`}>
              {iWon ? '你就是赢家。' : '这一局的胜利不属于你。'}
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl text-slate-200">无人获胜</h2>
            <p className="mt-2 text-sm text-slate-400">
              {match.maxRound} 回合结束，没有任何阵营达成自己的目标。
            </p>
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ranked.map((p, i) => (
          <div key={p.id} className="relative">
            <span className="absolute -left-1 top-2 z-10 rounded bg-slate-950 px-1.5 text-[10px] text-slate-500">
              #{i + 1}
            </span>
            <FactionPanel player={asPlayer(p)} highlight={p.id === playerId} />
            <p className="mt-1 px-1 text-[10px] text-slate-500">
              终局总和 {p.stats.manpower + p.stats.supply + p.stats.morale}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="mb-2 text-xs text-slate-400">终局回顾</p>
        <p className="text-[11px] leading-relaxed text-slate-400">
          {[...match.log, ...match.roundLog].slice(-6).map((l) => l.text).join(' ')}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => {
            leaveRoom()
            navigate('/')
          }}
        >
          离开房间，再来一局
        </Button>
      </div>
      <p className="text-[11px] text-slate-500">
        再来一局需要重新创建房间并等四人到齐；房间码会变，记得把新码发给朋友。
      </p>
    </section>
  )
}

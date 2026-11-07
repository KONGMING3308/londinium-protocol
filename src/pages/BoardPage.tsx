import { FACTION_MAP } from '@/mocks/factions'
import { useRoomStore } from '@/store/roomStore'
import { FactionPanel } from '@/components/FactionPanel'
import { LogList } from '@/components/LogList'
import { RoundTimeline } from '@/components/RoundTimeline'
import { Button } from '@/components/Button'
import type { PlayerState } from '@/types'

/**
 * 对局总览：全桌的公开信息一屏看完。
 * 注意这里只能展示公开数据——别人的手牌与胜利条件不在快照里，
 * 所以也不能拿 FACTION_MAP[factionId].victory 去「补」出来。
 */
export function BoardPage() {
  const match = useRoomStore((s) => s.match)
  const playerId = useRoomStore((s) => s.playerId)
  if (!match) return null

  return (
    <section className="space-y-4">
      <RoundTimeline current={match.round} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {match.players.map((p) => (
          <div key={p.id} className="space-y-1">
            <FactionPanel
              player={{ ...p, heldDesignated: null } as PlayerState}
              highlight={p.id === playerId}
            />
            <p className="px-1 text-[10px] text-slate-500">
              {FACTION_MAP[p.factionId].title}
              {p.id === playerId && <span className="ml-1 text-amber-300">· 你</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="mb-2 text-xs text-slate-400">完整日志</p>
        <LogList logs={[...match.log, ...match.roundLog]} limit={40} />
      </div>

      <Button variant="ghost" onClick={() => undefined} disabled>
        当前为第 {match.round} 回合
      </Button>
    </section>
  )
}

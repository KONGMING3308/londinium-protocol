/** 盟约窗口：结盟 / 撕约 / 进入结算 */
import { useState } from 'react'
import { canAlly } from '@/mocks/factions'
import { Button } from '@/components/Button'
import { FactionPanel } from '@/components/FactionPanel'
import { RoundTimeline } from '@/components/RoundTimeline'
import type { GameState } from '@/types'

interface Props {
  game: GameState
  onForm: (aId: string, bId: string) => void
  onBreak: (id: string) => void
  onResolve: () => void
}

export function CouncilPanel({ game, onForm, onBreak, onResolve }: Props) {
  const [pairA, setPairA] = useState('')
  const [pairB, setPairB] = useState('')
  const candidates = game.players.filter((p) => !p.allyId && !p.betrayed)
  const allPairs = game.players.filter((p) => p.allyId).length / 2
  const pairValid =
    Boolean(pairA && pairB && pairA !== pairB) &&
    canAlly(
      game.players.find((p) => p.id === pairA)!.factionId,
      game.players.find((p) => p.id === pairB)!.factionId,
    )

  const select = (value: string, setter: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => setter(e.target.value)}
      className="rounded border border-white/10 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200"
    >
      <option value="">选择一方</option>
      {candidates.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )

  return (
    <section className="space-y-4">
      <RoundTimeline current={game.round} />

      <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4">
        <p className="text-sm text-slate-200">四人已选定手牌。</p>
        <p className="mt-1 text-xs text-slate-500">
          这是最后的盟约窗口：结盟或撕毁均在此刻宣告，撕毁后本回合背刺加成立即生效。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {game.players.map((p) => (
          <FactionPanel key={p.id} player={p} compact />
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-xs text-slate-400">盟约状态（当前 {allPairs} / 2 对）</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {game.players.filter((p) => p.allyId).map((p) => (
            <span key={p.id} className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-200">
              {p.name} ↔ {game.players.find((o) => o.id === p.allyId)?.name}
            </span>
          ))}
          {allPairs === 0 && <span className="text-[11px] text-slate-600">尚无同盟</span>}
        </div>

        {allPairs > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {game.players.filter((p) => p.allyId).map((p) => (
              <Button key={p.id} variant="danger" onClick={() => onBreak(p.id)}>
                {p.name} 撕毁盟约
              </Button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          {select(pairA, setPairA)}
          {select(pairB, setPairB)}
          <Button
            variant="ghost"
            disabled={!pairValid || allPairs >= 2}
            onClick={() => {
              onForm(pairA, pairB)
              setPairA('')
              setPairB('')
            }}
          >
            缔结盟约
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-slate-600">
          仅剧情中实际合作过的势力可结盟；敌对势力不可结盟。
        </p>
      </div>

      <Button full onClick={onResolve}>进入结算</Button>
    </section>
  )
}

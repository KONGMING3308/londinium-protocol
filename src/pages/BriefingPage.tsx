import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FACTION_MAP, HOSTILE_PAIRS, canAlly } from '@/mocks/factions'
import { ROUND_MODIFIERS } from '@/mocks'
import { useGameStore } from '@/store/gameStore'
import { Button } from '@/components/Button'

export function BriefingPage() {
  const game = useGameStore((s) => s.game)
  const beginRound = useGameStore((s) => s.beginRound)
  const navigate = useNavigate()

  useEffect(() => {
    if (!game) navigate('/')
  }, [game, navigate])

  if (!game) return null

  const hostile = game.players.filter((p) =>
    game.players.some((o) => o.id !== p.id && HOSTILE_PAIRS.some(([a, b]) =>
      (a === p.factionId && b === o.factionId) || (b === p.factionId && a === o.factionId))),
  )
  const allied = game.players.flatMap((p) =>
    game.players
      .filter((o) => o.id !== p.id && o.id > p.id && canAlly(p.factionId, o.factionId))
      .map((o) => `${p.name} ↔ ${o.name}`),
  )

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">Briefing</p>
        <h2 className="font-display text-xl text-slate-100">战前简报</h2>
        <p className="mt-2 text-sm text-slate-400">
          本局阵营已随机分配。请记下自己的胜利条件——胜利只属于个人，没有团队胜利。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {game.players.map((p) => {
          const f = FACTION_MAP[p.factionId]
          return (
            <div key={p.id} className={`rounded-xl border border-white/10 bg-gradient-to-br p-4 ${f.accent}`}>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-white/50">{p.name}</span>
                <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-white/60">T{f.tier}</span>
              </div>
              <h3 className="font-display text-lg text-white">{f.name}</h3>
              <p className="mt-1 text-xs text-white/70">{f.summary}</p>
              <div className="mt-3 rounded border border-white/10 bg-black/20 p-2">
                <p className="text-[10px] uppercase tracking-wider text-amber-300/80">胜利条件</p>
                <p className="text-xs font-medium text-amber-100">{f.victory.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/60">{f.victory.description}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">本局敌对关系</p>
          <p className="mt-2 text-sm text-rose-200">{hostile.length} 个阵营卷入敌对</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            ⚔ 敌对势力永远不能结盟；只有剧情中实际合作过的势力才能结盟。
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">本局可结盟组合</p>
          <p className="mt-2 text-sm text-emerald-200">{allied.length > 0 ? allied.join('、') : '无可结盟组合'}</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-xs text-slate-400">第 1 回合剧情</p>
        <p className="mt-2 text-sm text-slate-200">{ROUND_MODIFIERS[0].label}：{ROUND_MODIFIERS[0].story}</p>
      </div>

      <Button onClick={() => { beginRound(); navigate('/round') }}>进入第 1 回合</Button>
    </section>
  )
}

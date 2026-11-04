import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FACTION_MAP } from '@/mocks/factions'
import { getModifier } from '@/utils/game/modifiers'
import { useGameStore } from '@/store/gameStore'
import { Button } from '@/components/Button'
import { CardTile } from '@/components/CardTile'
import { FactionPanel } from '@/components/FactionPanel'
import { LogList } from '@/components/LogList'

export function ResolvePage() {
  const game = useGameStore((s) => s.game)
  const nextRound = useGameStore((s) => s.nextRound)
  const takeFactionCard = useGameStore((s) => s.takeFactionCard)
  const navigate = useNavigate()

  useEffect(() => {
    if (!game) navigate('/')
  }, [game, navigate])

  if (!game) return null
  const mod = getModifier(game.round)
  const winner = game.winner ? FACTION_MAP[game.winner] : null
  const final = Boolean(game.winner) || game.round >= 7
  const hasFactionOffers = game.players.some(
    (p) =>
      p.allyId !== null &&
      ((game.factionOffers?.[p.id] ?? []).length > 0 || Boolean(game.factionPending?.[p.id])),
  )

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">Round {game.round} Result</p>
        <h2 className="font-display text-xl text-slate-100">{mod.label}：{mod.story}</h2>
        {game.pactEvent && (
          <p className="mt-2 text-xs text-fuchsia-200">
            盟约事件【{game.pactEvent.name}】：{game.pactEvent.text}
          </p>
        )}
      </div>

      {winner && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300">Victory</p>
          <h3 className="font-display text-2xl text-amber-100">{winner.name} 获胜</h3>
          <p className="mt-1 text-sm text-amber-200/80">{game.winnerReason}</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        {game.players.map((p) => (
          <FactionPanel key={p.id} player={p} compact />
        ))}
      </div>

      {hasFactionOffers && (
        <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/5 p-4">
          <p className="mb-3 text-xs text-fuchsia-200">阵营牌（仅同盟可用 · 下一回合开始前生效）</p>
          <div className="space-y-3">
            {game.players.map((p) => {
              if (p.allyId === null) return null
              const offers = game.factionOffers?.[p.id] ?? []
              const picked = game.factionPending?.[p.id]
              if (offers.length === 0 && !picked) return null
              return (
                <div key={p.id} className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-200">
                      {p.name}（{FACTION_MAP[p.factionId].name}）
                    </p>
                    {picked ? (
                      <p className="text-[10px] text-fuchsia-200">已选定：{picked.name}</p>
                    ) : (
                      <Button variant="ghost" onClick={() => takeFactionCard(p.id, null)}>
                        放弃
                      </Button>
                    )}
                  </div>
                  {!picked && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {offers.map((card) => (
                        <CardTile key={card.id} card={card} compact onClick={() => takeFactionCard(p.id, card.id)} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">阵营牌选择不阻塞进入下一回合。</p>
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="mb-2 text-xs text-slate-400">本回合结算</p>
        <LogList logs={game.roundLog} />
      </div>

      <Button
        full
        onClick={() => {
          nextRound()
          navigate(final ? '/result' : '/round')
        }}
      >
        {final ? '查看最终结算' : `进入第 ${game.round + 1} 回合`}
      </Button>
    </section>
  )
}

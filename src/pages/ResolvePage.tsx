/**
 * 回合结算页。
 * 阵营牌部分改为「逐人交接 → 选择 → 遮挡」：
 * 只有 factionPickerId 指的玩家能看到自己的候选牌，其余人只看到排队进度。
 * 选定后面板不显示牌名（保密），效果在下一回合开始前由日志揭晓。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock } from 'lucide-react'
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

  const pickerId = game?.factionPickerId ?? null
  const [revealed, setRevealed] = useState(false)

  // 换人时自动重新遮挡，避免上一位的候选牌残留在屏幕上
  useEffect(() => {
    setRevealed(false)
  }, [pickerId])

  useEffect(() => {
    if (!game) navigate('/')
  }, [game, navigate])

  if (!game) return null

  const mod = getModifier(game.round)
  const winner = game.winner ? FACTION_MAP[game.winner] : null
  const final = Boolean(game.winner) || game.round >= 7

  const queue = game.factionPickQueue ?? []
  const picker = pickerId ? game.players.find((p) => p.id === pickerId) ?? null : null
  const offers = picker ? game.factionOffers?.[picker.id] ?? [] : []
  const pickedIds = Object.keys(game.factionPending ?? {})

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

      {/* 阵营牌：逐个交接选择 */}
      {(queue.length > 0 || pickedIds.length > 0) && (
        <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-fuchsia-200">
              <Lock className="h-3.5 w-3.5" />
              阵营牌 · 仅同盟可用（下一回合开始前生效）
            </p>
            {queue.length > 0 && (
              <p className="text-[10px] text-slate-500">还剩 {queue.length} 人未选</p>
            )}
          </div>

          {/* 未轮到任何人：已选完 */}
          {!picker && (
            <p className="text-[11px] text-slate-400">
              本回合阵营牌已全部处理完毕。
              {pickedIds.length > 0 && ` ${pickedIds.length} 人已选定（保密，下回合生效时公布）。`}
            </p>
          )}

          {/* 轮到了，但还没确认身份：只显示交接提示 */}
          {picker && !revealed && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-slate-950/50 p-6 text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">请将设备交给</p>
              <h4 className="font-display text-2xl text-amber-200">{picker.name}</h4>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <EyeOff className="h-3.5 w-3.5" />
                接下来会显示 {picker.name} 的 2 张候选牌，其他玩家请勿查看
              </p>
              <Button onClick={() => setRevealed(true)}>
                我是 {picker.name}，查看我的候选牌
              </Button>
            </div>
          )}

          {/* 已确认身份：显示本候选牌 */}
          {picker && revealed && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] text-slate-200">
                  <Eye className="h-3.5 w-3.5 text-fuchsia-300" />
                  {picker.name}（{FACTION_MAP[picker.factionId].name}）的候选牌
                </p>
                <Button variant="ghost" onClick={() => takeFactionCard(picker.id, null)}>
                  全部放弃
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {offers.map((card) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    compact
                    onClick={() => takeFactionCard(picker.id, card.id)}
                  />
                ))}
              </div>
              <p className="text-[10px] text-slate-500">
                选 1 张带入下一回合；选定后本条记录不会显示牌名，效果在下一回合开始前公布。
              </p>
            </div>
          )}

          {/* 已选定名单（不含牌面） */}
          {pickedIds.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-2">
              <p className="text-[10px] text-slate-500">
                已选定：
                {pickedIds
                  .map((id) => game.players.find((p) => p.id === id)?.name ?? id)
                  .join('、')}
                <span className="ml-1 text-slate-600">（牌面保密）</span>
              </p>
            </div>
          )}
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
        {final
          ? '查看最终结算'
          : queue.length > 0
            ? `跳过剩余阵营牌，进入第 ${game.round + 1} 回合`
            : `进入第 ${game.round + 1} 回合`}
      </Button>
    </section>
  )
}

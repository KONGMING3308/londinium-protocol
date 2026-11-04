/** 交接遮挡页：确认下一位操作者后再发牌；同时把「你的目标 + 本回合要做什么」摊给他看 */
import { FACTION_MAP } from '@/mocks/factions'
import { Button } from '@/components/Button'
import type { PlayerState } from '@/types'

interface Props {
  player: PlayerState
  round: number
  onReady: () => void
}

export function HandoffPanel({ player, round, onReady }: Props) {
  const f = FACTION_MAP[player.factionId]
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border border-white/10 bg-slate-900/60 p-8 text-center">
      <p className="rounded bg-white/5 px-2 py-1 text-[11px] tracking-widest text-slate-400">
        第 {round} / 7 回合
      </p>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">请将设备交给</p>
      <h2 className="font-display text-3xl text-amber-200">{player.name}</h2>
      <p className={`rounded-lg border border-white/10 bg-gradient-to-br px-4 py-3 ${f.accent}`}>
        <span className="text-sm text-white">{f.name}</span>
      </p>

      {/* 自己的胜利条件：此时设备已交到本人手上，可以直接展示 */}
      <div className="w-full rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 text-left">
        <p className="text-[10px] uppercase tracking-widest text-amber-400/80">你的胜利条件</p>
        <p className="mt-1 text-sm font-medium text-amber-100">{f.victory.title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{f.victory.description}</p>
      </div>

      {/* 本回合操作清单：降低第一次上手的心智负担 */}
      <div className="w-full rounded-lg border border-white/10 bg-slate-950/40 p-3 text-left">
        <p className="text-[10px] uppercase tracking-widest text-slate-500">本回合你要做 3 件事</p>
        <ol className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-400">
          <li>
            <span className="text-amber-300/80">1.</span> 从 3 张行动牌里选{' '}
            <span className="text-slate-200">2 张</span> 打出
          </li>
          <li>
            <span className="text-amber-300/80">2.</span> 决定要不要接受那张中立援助
          </li>
          <li>
            <span className="text-amber-300/80">3.</span> 处置指定牌：打出（需选目标）／保留／弃置
          </li>
        </ol>
      </div>

      <p className="text-xs text-slate-500">其他玩家请勿查看屏幕。确认后开始选牌。</p>
      <Button onClick={onReady}>我准备好了</Button>
    </section>
  )
}

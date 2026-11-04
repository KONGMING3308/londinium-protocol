import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { RoundTimeline } from './RoundTimeline'
import { useGameStore } from '@/store/gameStore'

/** 子页面的明确返回目标；回合页与结算页由状态机驱动跳转，不提供返回 */
const BACK_TARGET: Record<string, { to: string; label: string }> = {
  '/briefing': { to: '/', label: '返回开局' },
  '/board': { to: '/round', label: '返回回合操作' },
  '/result': { to: '/board', label: '返回对局总览' },
  '/rules': { to: '/', label: '返回首页' },
  '/guide': { to: '/', label: '返回首页' },
}

export function Shell({ children }: { children: ReactNode }) {
  const game = useGameStore((s) => s.game)
  const reset = useGameStore((s) => s.reset)
  const location = useLocation()
  const inGame = Boolean(game) && location.pathname !== '/rules' && location.pathname !== '/guide'
  const back =
    location.pathname === '/rules' && game
      ? { to: '/round', label: '返回回合操作' }
      : BACK_TARGET[location.pathname]

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">Londinium Protocol</p>
          <h1 className="font-display text-2xl text-slate-100">伦蒂尼姆协议</h1>
        </div>
        <nav className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {back && (
            <Link className="text-amber-300 hover:text-amber-200" to={back.to} data-testid="back-link">
              ← {back.label}
            </Link>
          )}
          {inGame && (
            <Link className="hover:text-amber-300" to="/board">
              对局总览
            </Link>
          )}
          <Link className="hover:text-amber-300" to="/guide">
            新手引导
          </Link>
          <Link className="hover:text-amber-300" to="/rules">
            规则
          </Link>
          {inGame && (
            <button className="text-slate-500 hover:text-rose-300" onClick={() => reset()}>
              重开
            </button>
          )}
        </nav>
      </header>

      {inGame && game && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <RoundTimeline current={game.round} />
          <span className="text-[11px] text-slate-500">
            {game.phase === 'result' ? '对局结束' : `第 ${game.round} / 7 回合`}
          </span>
        </div>
      )}

      <main className="flex-1">{children}</main>

      <footer className="mt-8 border-t border-white/10 pt-3 text-[10px] text-slate-600">
        本地热座原型 · 数据存于浏览器 · 非官方同人作品
      </footer>
    </div>
  )
}

import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Loader2, Wifi, WifiOff } from 'lucide-react'
import { RoundTimeline } from './RoundTimeline'
import { PhaseTimer } from './PhaseTimer'
import { useRoomStore } from '@/store/roomStore'
import { APP_BUILD_TIME, APP_VERSION_LABEL } from '@/version'

/**
 * 各阶段超时后会「自动替你做什么」。
 * 写出来是为了让玩家知道：拖到时间到不是惩罚，系统会保守地帮你走一步。
 */
const TIMEOUT_HINT: Record<string, string> = {
  briefing: '超时自动确认已读',
  picking: '超时自动从上手牌打出 2 张行动牌，指定牌默认保留（不打人）',
  council: '超时自动跳过结盟，直接进入结算',
  resolved: '超时自动进入下一回合',
}

/**
 * 子页面的明确返回目标；回合页与结算页由状态机驱动跳转，不提供返回。
 * 大厅与简报不提供「返回首页」：那两页属于房间里的一环，
 * 点回首页会被状态机立刻拉回来，链接等于摆设，不如不给。
 */
const BACK_TARGET: Record<string, { to: string; label: string }> = {
  '/board': { to: '/round', label: '返回回合操作' },
  '/result': { to: '/board', label: '返回对局总览' },
  '/rules': { to: '/', label: '返回首页' },
  '/guide': { to: '/', label: '返回首页' },
}

/**
 * 本地热座调试条：固定显示在页面底部。
 *
 * 热座模式的本质是「一台设备轮流操作四个座位」，所以这里提供两个最关键的控制：
 * 切换当前操作者（等于原来「把设备传给下一个人」）、以及一键让全员准备／确认，
 * 后者是为了调试时不必来回点四次。
 */
function LocalDebugBar({
  seats,
  current,
  onChange,
}: {
  seats: ReadonlyArray<{ playerId: string; name: string }>
  current: string | null
  onChange: (playerId: string) => void
}) {
  const readyAll = useRoomStore((s) => s.localReadyAll)
  const ackAll = useRoomStore((s) => s.localAckAll)
  const room = useRoomStore((s) => s.room)
  const match = useRoomStore((s) => s.match)

  if (seats.length === 0) return null

  return (
    <div className="mt-5 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3" data-testid="local-debug-bar">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-sky-300/80">本地调试 · 当前操作者</span>
        {seats.map((s) => (
          <button
            key={s.playerId}
            type="button"
            data-testid={`local-viewer-${s.name}`}
            onClick={() => onChange(s.playerId)}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
              s.playerId === current
                ? 'bg-sky-500/30 text-sky-100'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {room?.phase === 'lobby' && (
          <button
            type="button"
            data-testid="local-ready-all"
            onClick={readyAll}
            className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/10"
          >
            四人全部准备
          </button>
        )}
        {room?.phase === 'briefing' && (
          <button
            type="button"
            data-testid="local-ack-all"
            onClick={ackAll}
            className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/10"
          >
            四人全部确认
          </button>
        )}
        {match && (
          <span className="text-[10px] text-slate-500">
            第 {match.round} / {match.maxRound} 回合 · {match.phase}
          </span>
        )}
        <span className="ml-auto text-[10px] text-slate-500">
          此模式不联网，刷新页面即结束
        </span>
      </div>
    </div>
  )
}

/** 顶部连接状态指示：让玩家知道自己在不在线，而不是对着不动的大厅发呆 */
function ConnectionBadge() {
  const status = useRoomStore((s) => s.status)
  if (status === 'open') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-emerald-300/80">
        <Wifi className="h-3 w-3" />
        已连接
      </span>
    )
  }
  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-amber-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status === 'connecting' ? '连接中…' : '重连中…'}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-rose-300/80">
      <WifiOff className="h-3 w-3" />
      未连接
    </span>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const room = useRoomStore((s) => s.room)
  const match = useRoomStore((s) => s.match)
  const playerId = useRoomStore((s) => s.playerId)
  const leaveRoom = useRoomStore((s) => s.leaveRoom)
  const status = useRoomStore((s) => s.status)
  const mode = useRoomStore((s) => s.mode)
  const localSeats = useRoomStore((s) => s.localSeats)
  const setLocalViewer = useRoomStore((s) => s.setLocalViewer)
  const location = useLocation()

  const inRoom = Boolean(room)
  const inGame = Boolean(match) && room?.phase !== 'lobby'
  const back =
    location.pathname === '/rules' && inGame
      ? { to: '/round', label: '返回回合操作' }
      : BACK_TARGET[location.pathname]

  const me = room?.seats.find((s) => s.playerId === playerId)
  const isLocal = mode === 'local'

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">Londinium Protocol</p>
          <h1 className="font-display text-2xl text-slate-100">伦蒂尼姆协议</h1>
          {inRoom && room && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              房间 <span className="font-mono tracking-widest text-amber-300/90">{room.roomId}</span>
              {me && <span className="ml-2 text-slate-400">你是 {me.name}</span>}
            </p>
          )}
        </div>
        <nav className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {isLocal ? (
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">
              本地热座调试
            </span>
          ) : (
            <ConnectionBadge />
          )}
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
          {/* 大厅页自带二次确认的「离开房间」，这里只在其他页面兜底，避免同一按钮出现两次 */}
          {inRoom && location.pathname !== '/lobby' && (
            <button
              className="text-slate-500 hover:text-rose-300"
              onClick={() => {
                if (window.confirm('确定要离开房间吗？大厅阶段离开会释放座位。')) leaveRoom()
              }}
            >
              离开房间
            </button>
          )}
        </nav>
      </header>

      {inGame && match && (
        <div className="mb-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RoundTimeline current={match.round} />
            <span className="text-[11px] text-slate-500">
              {match.phase === 'result' ? '对局结束' : `第 ${match.round} / ${match.maxRound} 回合`}
            </span>
          </div>
          {/* 阶段倒计时：暗选/盟约/简报会倒计时，结算与终局不计时 */}
          <PhaseTimer
            deadline={match.deadline}
            duration={match.duration}
            timeoutHint={TIMEOUT_HINT[match.phase]}
          />
        </div>
      )}

      <main className="flex-1">{children}</main>

      {isLocal && <LocalDebugBar seats={localSeats} current={playerId} onChange={setLocalViewer} />}

      {!isLocal && status !== 'open' && (
        <div className="mt-4 rounded border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          {status === 'reconnecting'
            ? '与服务器的连接已断开，正在自动重连……重连成功后会自动回到原来的座位，对局不会丢失。'
            : status === 'closed'
              ? '已断开与服务器的连接。请返回首页重新加入房间。'
              : '正在连接服务器……'}
        </div>
      )}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] text-slate-600">
        <span>线上四人联机 · 服务端权威 · 非官方同人作品</span>
        <span className="font-mono text-slate-500" data-testid="app-version" title={`构建于 ${APP_BUILD_TIME}`}>
          {APP_VERSION_LABEL}
        </span>
      </footer>
    </div>
  )
}

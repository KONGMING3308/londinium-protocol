/**
 * 首页：联机入口。
 *
 * 联机版没有「四个人共用一台设备」这回事：一个人建房间拿到 4 位房间码，
 * 另外三个人凭码进来，四人全部点准备后由服务端自动开局。
 * 这个页面不保存任何对局数据，建 / 进房间只是向 roomStore 发意图，
 * 之后该停在哪个页面由快照与路由状态机决定。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Hand, Loader2, Target, Trophy, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { hasForeignActiveSession } from '@/net/identity'
import { ROOM_CODE_LENGTH } from '@/shared/protocol'
import { useRoomStore } from '@/store/roomStore'

/** 昵称持久化 key：与 net 层记录「上次进房名字」用的是同一个，重连时能对上 */
const NAME_KEY = 'londinium-protocol-net-name'
const NAME_MAX = 12

/**
 * 页面级昵称缓存。
 * 主动离开房间时 net 层会清掉 localStorage 里的名字，这里保证同一次会话里
 * 回到首页仍然记得自己叫什么，不用重新输入。
 */
let rememberedName = ''

function readStoredName(): string {
  if (rememberedName) return rememberedName
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    // 隐私模式下 localStorage 不可用，退化成空昵称
    return ''
  }
}

function persistName(name: string): void {
  rememberedName = name
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // 同上：存不进去也不影响这一局
  }
}

/** 首页三要点：让新玩家在 10 秒内知道这是什么游戏 */
const PITCH = [
  {
    icon: Target,
    title: '你是谁',
    text: '你是六个阵营之一，只有你自己知道自己的胜利条件。这局没有队友，联机也没有「观战」可以偷看别人。',
  },
  {
    icon: Hand,
    title: '你做什么',
    text: '每回合从 3 张行动牌里暗选 2 张打出，涨人力／补给／士气，并用指定牌打击别人。四个人同时选，谁也不知道谁选了什么。',
  },
  {
    icon: Trophy,
    title: '怎么赢',
    text: '一共 7 回合，第 6、7 回合结束时判定。谁先达成自己的独有目标谁就赢。',
  },
]

export function HomePage() {
  const status = useRoomStore((s) => s.status)
  const joining = useRoomStore((s) => s.joining)
  const lastError = useRoomStore((s) => s.lastError)
  const createRoom = useRoomStore((s) => s.createRoom)
  const joinRoom = useRoomStore((s) => s.joinRoom)
  const clearError = useRoomStore((s) => s.clearError)
  const connect = useRoomStore((s) => s.connect)
  const startLocal = useRoomStore((s) => s.startLocal)

  const [name, setName] = useState(readStoredName)
  const [code, setCode] = useState('')
  /** 本地只记录「刚刚点的是哪个按钮」，用来显示对应的处理中文案，不是游戏状态 */
  const [pending, setPending] = useState<'create' | 'join' | null>(null)
  /** 本地调试模式的四个人名字（调试时通常直接默认） */
  const [showLocal, setShowLocal] = useState(false)
  const [localNames, setLocalNames] = useState('玩家1,玩家2,玩家3,玩家4')

  // 从大厅「离开房间」回来时连接是主动关掉的，这里自动接回来，不用玩家先点一遍「重新连接」
  useEffect(() => {
    if (status === 'closed' || status === 'idle') connect()
  }, [status, connect])

  // 快照到了（或服务端回了错）就把「处理中」收掉
  useEffect(() => {
    if (!joining) setPending(null)
  }, [joining])

  // 连接断开时那条 create/join 多半没送到服务端，别让按钮永远转圈
  useEffect(() => {
    if (status !== 'open') setPending(null)
  }, [status])

  // 兜底：服务端既不回快照也不回错误时，8 秒后放开按钮让玩家重试
  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => setPending(null), 8000)
    return () => window.clearTimeout(timer)
  }, [pending])

  const trimmedName = name.trim()
  const connected = status === 'open'
  const busy = joining || pending !== null
  const canCreate = trimmedName.length > 0 && !busy && connected
  const canJoin = trimmedName.length > 0 && code.length === ROOM_CODE_LENGTH && !busy && connected

  const handleName = (value: string) => {
    const next = value.slice(0, NAME_MAX)
    setName(next)
    persistName(next)
  }

  /** 房间码只保留字母数字并自动转大写，避免小写输入 / 空格导致进不去 */
  const handleCode = (value: string) => {
    setCode(value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, ROOM_CODE_LENGTH))
  }

  const handleCreate = () => {
    if (!canCreate) return
    setPending('create')
    createRoom(trimmedName)
  }

  const handleJoin = () => {
    if (!canJoin) return
    setPending('join')
    joinRoom(code, trimmedName)
  }

  /**
   * 这个页面出现在「另一个标签页正握着会话」的情况下时，给个说明。
   * 不接管是对的（否则两个标签页会抢同一个座位），但要让人知道为什么没自动进去。
   */
  const [foreignTab, setForeignTab] = useState(false)
  useEffect(() => {
    setForeignTab(hasForeignActiveSession())
  }, [])

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">Online · 4 Players</p>
        <h2 className="font-display text-xl text-amber-200">四人联机 · 各自为战</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          一个人创建房间并拿到 4 位房间码，另外三个人输入房间码加入。
          <span className="text-slate-300">四个人都在自己的设备上操作</span>
          ，牌和结算全部由服务器裁决，谁也改不了数值。四人全部准备后自动开局。
        </p>
      </div>

      {/* 服务端错误：房间不存在、房间已满、对局已开始等 */}
      {lastError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-rose-200">{lastError.message}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="关闭错误提示"
            className="shrink-0 text-rose-300/70 hover:text-rose-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 另一个标签页正在用这份会话：说明为什么本页没有自动进去 */}
      {foreignTab && (
        <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-200">
          <span className="font-medium">检测到另一个标签页正在这局游戏里。</span>
          本页没有自动接管（否则两个标签页会抢同一个座位、互相顶号掉线）。
          想和那一局的人对战，直接输入房间码加入；想自己开一局，直接创建房间。
        </div>
      )}

      {/* 连接状态：让玩家先知道「不是按钮坏了，是还没连上」 */}
      {(status === 'connecting' || status === 'reconnecting') && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          {status === 'connecting' ? '正在连接服务器…' : '连接断开，正在重连…'}
        </div>
      )}
      {status === 'closed' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] text-rose-200">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            与服务器的连接已断开，暂时无法建房或进房。
          </p>
          <Button variant="ghost" onClick={connect} className="px-2 py-1 text-[11px]">
            重新连接
          </Button>
        </div>
      )}
      {status === 'idle' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            尚未连接服务器。
          </p>
          <Button variant="ghost" onClick={connect} className="px-2 py-1 text-[11px]">
            连接服务器
          </Button>
        </div>
      )}

      {/* 昵称：全桌可见，所以要先填 */}
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <label className="text-[11px] text-slate-400" htmlFor="net-name">
          你的昵称
        </label>
        <input
          id="net-name"
          value={name}
          onChange={(e) => handleName(e.target.value)}
          placeholder="例如：阿米娅"
          maxLength={NAME_MAX}
          autoComplete="off"
          data-testid="nickname-input"
          className="mt-1 w-full rounded border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400/60"
        />
        <p className="mt-1 text-[10px] text-slate-500">
          最多 {NAME_MAX} 个字，其它三位玩家会在大厅里看到这个名字。
          {trimmedName.length === 0 && <span className="ml-1 text-amber-300/80">先填个昵称才能建 / 进房间。</span>}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* 创建房间 */}
        <div className="flex flex-col rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <h3 className="font-display text-base text-slate-100">创建房间</h3>
          <p className="mt-1 flex-1 text-[11px] leading-relaxed text-slate-400">
            你当房主，生成一个 4 位房间码，把它发给你们另外三个人。
          </p>
          <Button full className="mt-3" disabled={!canCreate} onClick={handleCreate} data-testid="create-room">
            {pending === 'create' ? '正在创建房间…' : '创建房间'}
          </Button>
        </div>

        {/* 加入房间 */}
        <div className="flex flex-col rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <h3 className="font-display text-base text-slate-100">加入房间</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">输入房主给你的房间码。</p>
          <input
            value={code}
            onChange={(e) => handleCode(e.target.value)}
            placeholder="ABCD"
            inputMode="text"
            autoComplete="off"
            aria-label="房间码"
            maxLength={ROOM_CODE_LENGTH}
            data-testid="room-code-input"
            className="mt-2 w-full rounded border border-white/10 bg-slate-950/60 px-3 py-2 text-center font-mono text-xl tracking-[0.5em] text-amber-200 outline-none focus:border-amber-400/60"
          />
          <Button full variant="ghost" className="mt-3" disabled={!canJoin} onClick={handleJoin} data-testid="join-room">
            {pending === 'join' ? '正在加入房间…' : '加入房间'}
          </Button>
        </div>
      </div>

      {/* 三要点速览 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {PITCH.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.title} className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-200">
                <Icon className="h-3.5 w-3.5" />
                {item.title}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{item.text}</p>
            </div>
          )
        })}
      </div>

      {/* 新手引导入口 */}
      <Link
        to="/guide"
        className="flex items-center justify-between rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-500/10 to-transparent p-4 transition-colors hover:border-amber-400/60"
      >
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm text-amber-100">第一次玩？先看 3 分钟新手引导</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              一回合做什么、三种数值怎么理解、新手最常犯的 5 个错。
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-amber-300">→</span>
      </Link>

      {/* 规则入口 */}
      <Link
        to="/rules"
        className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/40 p-3 transition-colors hover:border-white/25"
      >
        <p className="text-[11px] text-slate-400">
          <span className="text-slate-200">规则速查</span>
          ：阵营、牌型、指定牌与结算顺序都在这里，中途也能随时翻。
        </p>
        <span className="shrink-0 text-xs text-slate-500">→</span>
      </Link>

      {/* 本地热座调试模式：一个人在一台设备上跑完四个座位，不需要开服务端 */}
      <div className="rounded-lg border border-white/5 bg-slate-950/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">
            <span className="text-slate-400">本地热座调试</span>
            ：一个人在一台设备上跑完四个座位，不用第二个浏览器也不用开服务端。
            规则与联机完全同源（同一个引擎），适合快速验证平衡性与流程。
          </p>
          <button
            type="button"
            onClick={() => setShowLocal((v) => !v)}
            className="shrink-0 text-[11px] text-slate-500 underline decoration-dotted hover:text-amber-300"
            data-testid="toggle-local-mode"
          >
            {showLocal ? '收起' : '展开'}
          </button>
        </div>

        {/* 多标签页现在各用各的身份（sessionStorage + 心跳），不会再互相顶号 */}
        <p className="mt-2 rounded border border-amber-400/20 bg-amber-500/5 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200/80">
          <span className="font-medium text-amber-200">本机多开注意：</span>
          同一个浏览器的多个标签页现在<span className="font-medium">各用各的身份</span>
          ——每个标签页是一条独立会话，
          刷新只恢复自己那一条，不会抢别人的座位。想在本机两个人对打：
          标签页 A 建房，标签页 B 用房间码加入即可。
          <span className="text-amber-200/70">
            注意同一个标签页只能坐一个座位，别在两个标签页里同时操作同一个玩家。
          </span>
        </p>
        {showLocal && (
          <div className="mt-3 space-y-2">
            <label className="text-[11px] text-slate-400" htmlFor="local-names">
              四个人的名字（用逗号分隔，留空则用「玩家1…玩家4」）
            </label>
            <input
              id="local-names"
              value={localNames}
              onChange={(e) => setLocalNames(e.target.value)}
              maxLength={80}
              className="w-full rounded border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-400/60"
            />
            <Button
              variant="ghost"
              className="text-xs"
              data-testid="start-local-mode"
              onClick={() => {
                const names = localNames
                  .split(/[,，\s]+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                startLocal(names)
              }}
            >
              开始本地热座调试
            </Button>
            <p className="text-[10px] leading-relaxed text-slate-500">
              进入后可以在页面顶部切换「当前操作者」，也可以一键让四个人全部准备／全部确认简报。
              此模式不连接网络，刷新页面即结束。
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

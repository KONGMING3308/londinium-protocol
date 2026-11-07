/**
 * 大厅：等另外三个人进来、各自点准备。
 *
 * 这一页只做三件事：把房间码显示得足够大（方便念给队友）、把 4 个座位摆清楚、
 * 让我能准备 / 取消准备。所有状态都来自 roomStore 的 room.seats，
 * 页面里没有任何本地副本，别人一进房服务端推一份快照，四个人的屏幕会同时变。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, Crown, Loader2, LogOut, UserPlus, WifiOff } from 'lucide-react'
import { Button } from '@/components/Button'
import { ROOM_CAPACITY } from '@/shared/protocol'
import type { SeatView } from '@/shared/protocol'
import { useRoomStore } from '@/store/roomStore'

type CopyState = 'idle' | 'done' | 'failed'

export function LobbyPage() {
  const room = useRoomStore((s) => s.room)
  const playerId = useRoomStore((s) => s.playerId)
  const setReady = useRoomStore((s) => s.setReady)
  const leaveRoom = useRoomStore((s) => s.leaveRoom)
  const navigate = useNavigate()

  const [copy, setCopy] = useState<CopyState>('idle')
  const [confirmLeave, setConfirmLeave] = useState(false)

  // 没有房间就没有大厅可言（比如主动离开或被服务端清掉）
  useEffect(() => {
    if (!room) navigate('/', { replace: true })
  }, [room, navigate])

  // 复制成功提示 2 秒后自动收起
  useEffect(() => {
    if (copy !== 'done') return
    const timer = window.setTimeout(() => setCopy('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [copy])

  if (!room) return null

  const me = room.seats.find((s) => s.playerId === playerId)
  const myReady = me?.ready ?? false
  const readyCount = room.seats.filter((s) => s.ready).length
  const capacity = room.capacity || ROOM_CAPACITY
  /**
   * 四人全准备 = 服务端马上开局。这里优先读 room.allReady（权威值），
   * readyCount 只作为兜底，避免快照里座位数与容量不一致时提示不准。
   */
  const allReady = room.allReady || readyCount >= capacity
  /** 空座位：服务端只下发现在有人坐的座位，剩余数量靠容量差算 */
  const emptySeats = Math.max(0, capacity - room.seats.length)

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(room.roomId)
      setCopy('done')
    } catch {
      setCopy('failed')
    }
  }

  const handleLeave = () => {
    if (!confirmLeave) {
      setConfirmLeave(true)
      return
    }
    setConfirmLeave(false)
    leaveRoom()
    navigate('/', { replace: true })
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      {/* 房间码：这是要念给队友听的东西，所以放到最大 */}
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5 text-center">
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">Room Code</p>
        <p
          className="mt-2 font-mono text-5xl tracking-[0.35em] text-amber-200"
          data-testid="room-code"
        >
          {room.roomId}
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          把这 4 位码发给另外三个人，他们在首页输入就能进来。
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button variant="ghost" onClick={handleCopy} className="text-xs">
            {copy === 'done' ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copy === 'done' ? '已复制' : '复制房间码'}
          </Button>
          <span className="text-[11px] text-slate-500">
            在线 {room.onlineCount} / {capacity} 人
          </span>
        </div>
        {copy === 'failed' && (
          <p className="mt-2 text-[11px] text-rose-300">复制失败，请手动记录房间码。</p>
        )}
      </div>

      {/* 准备进度 */}
      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-200">
            已准备 <span className="font-mono text-amber-200">{readyCount}</span> / {capacity}
          </p>
          {allReady ? (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              即将开始，正在分配阵营…
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">
              四人到齐且全部准备后自动开局
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${capacity > 0 ? (readyCount / capacity) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* 座位卡 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {room.seats.map((seat) => (
          <SeatCard key={seat.playerId} seat={seat} isMe={seat.playerId === playerId} />
        ))}
        {Array.from({ length: emptySeats }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex min-h-[86px] flex-col justify-center rounded-lg border border-dashed border-white/15 bg-slate-900/20 p-4 text-center"
          >
            <UserPlus className="mx-auto h-4 w-4 text-slate-600" />
            <p className="mt-1.5 text-[11px] text-slate-500">等待加入…</p>
          </div>
        ))}
      </div>

      {/* 我的操作 */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!me}
          onClick={() => setReady(!myReady)}
          className="min-w-[9rem]"
          data-testid="ready-toggle"
        >
          {myReady ? '取消准备' : '准备'}
        </Button>
        {confirmLeave ? (
          <>
            <span className="text-[11px] text-rose-300">确定要离开房间吗？离开后座位会释放给其他人。</span>
            <Button variant="danger" onClick={handleLeave} className="text-xs" data-testid="leave-confirm">
              <LogOut className="mr-1 h-3.5 w-3.5" />
              确认离开
            </Button>
            <Button
              variant="muted"
              onClick={() => setConfirmLeave(false)}
              className="text-xs"
              data-testid="leave-cancel"
            >
              取消
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={handleLeave} className="text-xs" data-testid="leave-room">
            <LogOut className="mr-1 h-3.5 w-3.5" />
            离开房间
          </Button>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-slate-600">
        准备状态会实时同步给所有人。房主离开后房主身份会自动转给房间里剩下的第一位玩家，房间不会解散。
      </p>
    </section>
  )
}

/** 一张座位卡：名字 + 房主 + 在线 + 准备 */
function SeatCard({ seat, isMe }: { seat: SeatView; isMe: boolean }) {
  return (
    <div
      data-testid="seat-card"
      className={`rounded-lg border p-4 ${
        isMe ? 'border-amber-400/60 bg-amber-500/5' : 'border-white/10 bg-slate-900/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm text-slate-100">
            {seat.isHost && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
            <span className="truncate">{seat.name}</span>
            {isMe && <span className="shrink-0 text-[10px] text-amber-300/90">（你）</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {seat.isHost && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">房主</span>
            )}
            {seat.connected ? (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">在线</span>
            ) : (
              <span className="flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300">
                <WifiOff className="h-2.5 w-2.5" />
                掉线重连中
              </span>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-1 text-[10px] ${
            seat.ready ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-slate-400'
          }`}
        >
          {seat.ready ? '已准备' : '未准备'}
        </span>
      </div>
    </div>
  )
}

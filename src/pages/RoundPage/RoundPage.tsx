/**
 * 回合页（联机版）：四人并行，没有「当前操作者」。
 *
 * 页面结构
 * - 顶部：回合数、本回合盟约事件、四人提交状态条（room.seats[].submittedPick）。
 * - 我未提交：渲染 PickingPanel；已提交：只显示等待面板 + 等待名单。
 * - phase==='council'：渲染 CouncilPanel。
 * - 已出局：只显示旁观面板（服务端只统计未出局者，出局者不参与推进）。
 *
 * 权威状态全部来自 roomStore 的 room / match。本页只维护一个「服务端拒绝计数」，
 * 用来在 submitPick 被拒后解除子面板的本地锁（服务端不会记录被拒的提交）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, CheckCircle2, Loader2 } from 'lucide-react'
import { useRoomStore } from '@/store/roomStore'
import { FACTION_MAP } from '@/mocks/factions'
import { describeStoryEvent } from '@/utils/game/story'
import { describePactEvent } from '@/utils/game/pact'
import { PickingPanel, type SubmitPickInput } from './PickingPanel'
import { CouncilPanel } from './CouncilPanel'
import type { SeatView } from '@/shared/protocol'

/**
 * 需要提交的座位：已出局的玩家不参与本轮提交（服务端只统计未出局者），
 * 所以进度分母与等待名单都要把他们剔掉，否则会出现永远凑不满的 4/4。
 */
function useActiveSeats(): SeatView[] {
  const room = useRoomStore((s) => s.room)
  const match = useRoomStore((s) => s.match)
  return useMemo(() => {
    const seats = room?.seats ?? []
    if (!match) return seats
    const defeated = new Set(match.players.filter((p) => p.defeated).map((p) => p.id))
    const active = seats.filter((s) => !defeated.has(s.playerId))
    return active.length > 0 ? active : seats
  }, [room, match])
}

/** 顶部状态条：谁已提交 / 谁还在思考 */
function SubmitStatusBar({ submitted }: { submitted: boolean }) {
  const playerId = useRoomStore((s) => s.playerId)
  const seats = useActiveSeats()
  const doneCount = seats.filter((s) => s.submittedPick).length

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400">暗选进度</p>
        <p className="font-mono text-[11px] text-slate-500">
          已提交 {doneCount} / {seats.length || 4}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {seats.map((seat) => {
          const isMe = seat.playerId === playerId
          return (
            <span
              key={seat.playerId}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${
                seat.submittedPick
                  ? 'bg-emerald-500/15 text-emerald-200'
                  : 'bg-white/5 text-slate-400'
              } ${isMe ? 'ring-1 ring-amber-400/50' : ''}`}
            >
              {seat.submittedPick ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Loader2 className="h-3 w-3 animate-pulse" />
              )}
              {seat.name}
              {isMe && '（我）'}
              <span className="text-slate-500">{seat.submittedPick ? '已提交' : '思考中'}</span>
              {!seat.connected && <span className="text-rose-300">· 离线</span>}
            </span>
          )
        })}
      </div>
      {submitted && (
        <p className="mt-2 text-[10px] text-slate-500">
          你已提交本回合选牌，内容在结算前对其他人不可见。
        </p>
      )}
    </div>
  )
}

/** 等待面板：我已提交，等别人 */
function WaitingPanel() {
  const playerId = useRoomStore((s) => s.playerId)
  const seats = useActiveSeats()
  const pending = seats.filter((s) => !s.submittedPick)
  const doneCount = seats.length - pending.length

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/50 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
        <p className="font-display text-lg text-slate-100">
          已提交，等待其他玩家（{doneCount} / {seats.length || 4}）
        </p>
        <p className="text-[11px] leading-relaxed text-slate-500">
          四人全部提交后自动进入盟约窗口；页面跟着服务器快照自动跳转，无需刷新。
        </p>
        {pending.length > 0 && (
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {pending.map((seat) => (
              <span
                key={seat.playerId}
                className={`rounded bg-white/5 px-2 py-1 text-[11px] ${
                  seat.connected ? 'text-slate-400' : 'text-rose-300'
                }`}
              >
                {seat.name}
                {seat.playerId === playerId && '（我）'}
                {seat.connected ? '：思考中' : '：已离线，等待重连'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 出局者面板：本轮无需提交，旁观即可 */
function SpectatorPanel() {
  return (
    <div className="rounded-lg border border-rose-400/30 bg-rose-500/5 p-6 text-center">
      <Ban className="mx-auto h-6 w-6 text-rose-300" />
      <p className="mt-2 font-display text-lg text-rose-100">你已出局</p>
      <p className="mt-1 text-[11px] leading-relaxed text-rose-200/80">
        本回合起你不再参与暗选与盟约，等待其他人推进对局即可。
      </p>
    </div>
  )
}

export function RoundPage() {
  const room = useRoomStore((s) => s.room)
  const match = useRoomStore((s) => s.match)
  const playerId = useRoomStore((s) => s.playerId)
  const lastError = useRoomStore((s) => s.lastError)
  const submitPick = useRoomStore((s) => s.submitPick)
  const councilAllyRequest = useRoomStore((s) => s.councilAllyRequest)
  const councilAllyRespond = useRoomStore((s) => s.councilAllyRespond)
  const councilBreakAlly = useRoomStore((s) => s.councilBreakAlly)
  const councilReady = useRoomStore((s) => s.councilReady)

  // 服务端每报一次错就自增：子面板据此解除「已发出」的本地锁，允许重试
  const [rejectTick, setRejectTick] = useState(0)
  const seenError = useRef<{ code: string; message: string } | null>(null)
  useEffect(() => {
    if (lastError && lastError !== seenError.current) {
      seenError.current = lastError
      setRejectTick((n) => n + 1)
    }
    if (!lastError) seenError.current = null
  }, [lastError])

  if (!room || !match) return null

  const mySeat = room.seats.find((s) => s.playerId === playerId)
  const mySubmitted = Boolean(mySeat?.submittedPick) || Boolean(match.self.submitted)
  const isCouncil = match.phase === 'council'
  const pactEvent = match.pactEvent
  const storyEvent = match.storyEvent
  const self = match.self
  // 已出局者不参与盟约推进，不进分母
  const activePlayerCount = match.players.filter((p) => !p.defeated).length

  const handleSubmit = (input: SubmitPickInput) => submitPick(input)

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">
              第 {match.round} / {match.maxRound} 回合
            </p>
            <h2 className="font-display text-xl text-slate-100">
              {self.defeated
                ? '旁观中'
                : isCouncil
                  ? '盟约窗口'
                  : mySubmitted
                    ? '等待其他玩家'
                    : '本回合暗选'}
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              你是 {self.name}（{FACTION_MAP[self.factionId].name}）
              {self.exiled && <span className="ml-1 text-amber-300">· 流亡中</span>}
              {self.defeated && <span className="ml-1 text-rose-300">· 已出局</span>}
            </p>
          </div>
          {pactEvent ? (
            <div className="max-w-md rounded border border-fuchsia-400/25 bg-fuchsia-500/5 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-fuchsia-300/80">
                本回合盟约事件
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-fuchsia-100">
                【{pactEvent.name}】{pactEvent.text}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-fuchsia-200/80">
                {describePactEvent(pactEvent)}
              </p>
            </div>
          ) : isCouncil ? (
            <div className="max-w-md rounded border border-white/10 bg-slate-900/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-400/80">
                盟约事件
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                本回合盟约事件在结算时随机判定：场上没有盟约就不会触发，有盟约则各有概率，
                并可能对同盟或孤立者造成不同影响。
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {storyEvent && (
        <div
          className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2"
          data-testid="round-story"
        >
          <p className="text-[10px] uppercase tracking-widest text-amber-300/80">
            本回合剧情 · 【{storyEvent.label}】
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-100">{storyEvent.story}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            全场生效：{describeStoryEvent(storyEvent)}
          </p>
        </div>
      )}

      {!isCouncil && <SubmitStatusBar submitted={mySubmitted} />}

      {self.defeated ? (
        <SpectatorPanel />
      ) : isCouncil ? (
        <CouncilPanel
          self={self}
          players={match.players}
          council={match.council}
          readyCount={match.council.readyCount}
          activeCount={activePlayerCount}
          rejectTick={rejectTick}
          onRequest={councilAllyRequest}
          onRespond={councilAllyRespond}
          onBreak={councilBreakAlly}
          onReady={councilReady}
        />
      ) : mySubmitted ? (
        <WaitingPanel />
      ) : (
        <PickingPanel
          key={`${match.round}-pick`}
          self={self}
          players={match.players}
          round={match.round}
          rejectTick={rejectTick}
          neutralPoints={match.neutralPoints}
          myBid={match.myBid}
          bidCount={match.bidCount}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  )
}

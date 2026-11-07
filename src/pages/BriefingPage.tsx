/**
 * 战前简报：分两段。
 *
 * 第一段「公开情报」——本局阵营归属、敌对关系、可结盟组合、首回合剧情，这些全桌可见；
 * 第二段「我的目标」——联机版每人盯着自己的屏幕，所以没有「把设备传给下一个人」的交接流程：
 * 我自己点开、自己看完、自己确认，服务器收到四份确认后自动开始第 1 回合。
 *
 * 这里不保存任何对局数据：阵营从 match.players 读，胜利条件从 match.self.victory 读，
 * 确认进度从 room.seats[].briefingAck 读。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Eye, EyeOff, ShieldAlert, Users } from 'lucide-react'
import { FACTION_MAP, HOSTILE_PAIRS, canAlly } from '@/mocks/factions'
import type { FactionId } from '@/types'
import { Button } from '@/components/Button'
import { useRoomStore } from '@/store/roomStore'

type Stage = 'public' | 'private'

export function BriefingPage() {
  const room = useRoomStore((s) => s.room)
  const match = useRoomStore((s) => s.match)
  const playerId = useRoomStore((s) => s.playerId)
  const briefingAck = useRoomStore((s) => s.briefingAck)
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>('public')

  // 没有对局就没有简报可看：有房间但没对局说明还没开局，退回大厅等；
  // 连房间都没有就直接回首页。两种情况都和 App 的状态机跳转目标一致，不会互相抢。
  useEffect(() => {
    if (!room) navigate('/', { replace: true })
    else if (!match) navigate('/lobby', { replace: true })
  }, [room, match, navigate])

  if (!match || !room) return null

  const seats = room.seats
  const ackCount = seats.filter((s) => s.briefingAck).length
  const myAck = seats.find((s) => s.playerId === playerId)?.briefingAck ?? false
  const players = match.players
  const self = match.self
  const selfFaction = FACTION_MAP[self.factionId]

  /** 本局敌对关系：任意两名玩家阵营落在 HOSTILE 表里 */
  const hostilePairs: Array<[string, string]> = players.flatMap((p, i) =>
    players
      .slice(i + 1)
      .filter((o) => isHostile(p.factionId, o.factionId))
      .map((o) => [p.name, o.name] as [string, string]),
  )

  /** 本局可结盟组合：同一对阵营只列一次 */
  const allyPairs: Array<[string, string]> = players.flatMap((p, i) =>
    players
      .slice(i + 1)
      .filter((o) => canAlly(p.factionId, o.factionId))
      .map((o) => [p.name, o.name] as [string, string]),
  )

  /* ---------------- 第一段：公开情报 ---------------- */
  if (stage === 'public') {
    return (
      <section className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">Briefing</p>
          <h2 className="font-display text-xl text-slate-100">战前简报 · 公开情报</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            本局阵营已随机分配，四个人各看各的屏幕。下面这些是
            <span className="text-slate-300">全桌都能看到</span>
            的公开信息；
            <span className="text-amber-200">各自的胜利条件不在这里公布</span>
            ——下一步你看自己的，别人看别人的。
          </p>
        </div>

        {/* 阵营归属：只有身份，没有目标 */}
        <div className="grid gap-3 md:grid-cols-2">
          {players.map((p) => {
            const f = FACTION_MAP[p.factionId]
            const isMe = p.id === self.id
            return (
              <div
                key={p.id}
                className={`rounded-xl border bg-gradient-to-br p-4 ${f.accent} ${
                  isMe ? 'border-amber-400/70' : 'border-white/10'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-white/60">
                    {p.name}
                    {isMe && <span className="ml-1 text-amber-200">（你）</span>}
                  </span>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-white/60">
                    T{f.tier}
                  </span>
                </div>
                <h3 className="font-display text-lg text-white">{f.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-white/70">{f.summary}</p>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-white/40">
                  <EyeOff className="h-3 w-3" />
                  胜利条件：本人私下确认
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-300" />
              本局敌对关系
            </p>
            <p className="mt-2 text-sm leading-relaxed text-rose-200">
              {hostilePairs.length > 0
                ? hostilePairs.map(([a, b]) => `${a} ⚔ ${b}`).join('、')
                : '本局没有敌对组合'}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              敌对势力永远不能结盟。<span className="text-slate-300">只有下面列出的组合能结盟</span>
              ，其它组合一律不行——盟约窗口里选不到别人不是 bug。
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Users className="h-3.5 w-3.5 text-emerald-300" />
              本局可结盟组合
            </p>
            <p className="mt-2 text-sm leading-relaxed text-emerald-200">
              {allyPairs.length > 0
                ? allyPairs.map(([a, b]) => `${a} ↔ ${b}`).join('、')
                : '无可结盟组合'}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">第 1 回合：潜入</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            罗德岛进入伦蒂尼姆，各方势力开始互相试探。
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            每回合开场会从 3 个剧情事件里随机抽 1 个，对全场所有阵营同时生效——
            同一回合在不同局里可能发生完全不同的事，所以每局都要重新判断局势。
          </p>
        </div>

        <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-4">
          <p className="text-xs text-amber-200">接下来：查看你自己的胜利条件</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            下一步只显示你自己的阵营与胜利条件，别人的屏幕上不会出现这些内容。
            看完点确认，等四个人都确认完，第 1 回合自动开始。
          </p>
        </div>

        <Button onClick={() => setStage('private')} data-testid="reveal-victory">查看我的目标</Button>
      </section>
    )
  }

  /* ---------------- 第二段：我的目标 ---------------- */
  return (
    <section className="mx-auto max-w-lg space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 text-center">
        <p className="rounded bg-white/5 px-2 py-1 text-[11px] tracking-widest text-slate-400">
          战前简报 · 我的目标
        </p>
        <p className="mt-2 text-xs text-slate-500">
          <EyeOff className="mr-1 inline h-3 w-3" />
          这份信息只发给了你一个人
        </p>
      </div>

      {/* 我的阵营卡：配色取自阵营定义，数值与胜利条件都来自服务端快照 */}
      <div className={`rounded-xl border border-white/10 bg-gradient-to-br p-5 ${selfFaction.accent}`}>
        <p className="text-[11px] text-white/50">{self.name}</p>
        <h3 className="font-display text-xl text-white">{selfFaction.name}</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/70">{selfFaction.summary}</p>

        <div className="mt-3 rounded border border-white/10 bg-black/25 p-3">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300/80">
            <Eye className="h-3 w-3" />
            你的胜利条件
          </p>
          <p className="mt-1 text-sm font-medium text-amber-100">{match.self.victory.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/70">
            {match.self.victory.description}
          </p>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <p className="text-[10px] text-white/40">人力</p>
            <p className="text-sm font-mono text-rose-200">{self.stats.manpower}</p>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <p className="text-[10px] text-white/40">补给</p>
            <p className="text-sm font-mono text-amber-200">{self.stats.supply}</p>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <p className="text-[10px] text-white/40">士气</p>
            <p className="text-sm font-mono text-sky-200">{self.stats.morale}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <EyeOff className="h-3.5 w-3.5" />
          记得住就行，不用背下来——对局里随时可以回看规则，但目标只有你自己知道。
        </p>
      </div>

      {myAck ? (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
            <Check className="h-3.5 w-3.5" />
            已确认，等待其他玩家…（{ackCount} / {room.capacity}）
          </div>
          <p className="text-center text-[10px] text-slate-500">
            四个人都确认后，服务器会自动发第 1 回合的手牌。
          </p>
        </div>
      ) : (
        <Button full onClick={briefingAck} data-testid="briefing-ack">
          记住了，确认我的目标
        </Button>
      )}

      {/* 等待名单：让别人一眼看清还差谁 */}
      {myAck && (
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
          <p className="text-[11px] text-slate-400">还差这些人确认</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {seats
              .filter((s) => !s.briefingAck)
              .map((s) => (
                <span
                  key={s.playerId}
                  className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-400"
                >
                  {s.name}
                </span>
              ))}
            {seats.every((s) => s.briefingAck) && (
              <span className="text-[11px] text-emerald-300">全员已确认，正在开局…</span>
            )}
          </div>
        </div>
      )}

      <Button variant="ghost" full className="text-xs" onClick={() => setStage('public')}>
        返回公开情报
      </Button>
    </section>
  )
}

/** HOSTILE_PAIRS 是双向语义的元组表，这里做一次对称查询 */
function isHostile(a: FactionId, b: FactionId): boolean {
  return HOSTILE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

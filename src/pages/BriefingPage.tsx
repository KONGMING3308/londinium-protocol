/**
 * 战前简报：分两段。
 * 第一段「公开情报」——本局阵营归属、敌对关系、可结盟组合、首回合剧情，这些全桌可见；
 * 第二段「逐人交接」——设备依次传给每位玩家，只有本人确认后才显示自己的胜利条件。
 * 目的：让目标成为真正的秘密信息，而不是四个人一起围观一张表。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ShieldAlert, Users } from 'lucide-react'
import { FACTION_MAP, HOSTILE_PAIRS, canAlly } from '@/mocks/factions'
import { ROUND_MODIFIERS } from '@/mocks'
import { useGameStore } from '@/store/gameStore'
import { Button } from '@/components/Button'

type Stage = 'public' | 'private'

export function BriefingPage() {
  const game = useGameStore((s) => s.game)
  const beginRound = useGameStore((s) => s.beginRound)
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>('public')
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!game) navigate('/')
  }, [game, navigate])

  if (!game) return null

  const total = game.players.length
  const current = game.players[index]
  const isLast = index + 1 >= total

  const hostile = game.players.filter((p) =>
    game.players.some((o) => o.id !== p.id && HOSTILE_PAIRS.some(([a, b]) =>
      (a === p.factionId && b === o.factionId) || (b === p.factionId && a === o.factionId))),
  )
  const allied = game.players.flatMap((p) =>
    game.players
      .filter((o) => o.id !== p.id && o.id > p.id && canAlly(p.factionId, o.factionId))
      .map((o) => `${p.name} ↔ ${o.name}`),
  )

  const finish = () => {
    beginRound()
    navigate('/round')
  }

  /* ---------------- 第一段：公开情报 ---------------- */
  if (stage === 'public') {
    return (
      <section className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">Briefing</p>
          <h2 className="font-display text-xl text-slate-100">战前简报 · 公开情报</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            本局阵营已随机分配。下面这些是全桌都能看到的公开信息。
            <span className="text-amber-200">各自的胜利条件不在这里公布</span>
            ——接下来会逐个人私下确认。
          </p>
        </div>

        {/* 阵营归属：只有身份，没有目标 */}
        <div className="grid gap-3 md:grid-cols-2">
          {game.players.map((p) => {
            const f = FACTION_MAP[p.factionId]
            return (
              <div key={p.id} className={`rounded-xl border border-white/10 bg-gradient-to-br p-4 ${f.accent}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-white/50">{p.name}</span>
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
            <p className="mt-2 text-sm text-rose-200">{hostile.length} 个阵营卷入敌对</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              ⚔ 敌对势力永远不能结盟；只有剧情中实际合作过的势力才能结盟。
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Users className="h-3.5 w-3.5 text-emerald-300" />
              本局可结盟组合
            </p>
            <p className="mt-2 text-sm leading-relaxed text-emerald-200">
              {allied.length > 0 ? allied.join('、') : '无可结盟组合'}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">第 1 回合剧情</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            {ROUND_MODIFIERS[0].label}：{ROUND_MODIFIERS[0].story}
          </p>
        </div>

        <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-4">
          <p className="text-xs text-amber-200">接下来：逐人查看自己的胜利条件</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            设备会依次传给每位玩家。轮到谁，谁点开自己的目标看一眼、记住它，然后遮挡屏幕交给下一位。
            看完四个人就开始第 1 回合。
          </p>
        </div>

        <Button onClick={() => setStage('private')}>开始逐人简报</Button>
      </section>
    )
  }

  /* ---------------- 第二段：逐人交接 ---------------- */
  const f = FACTION_MAP[current.factionId]

  // 未确认身份：只显示交接提示，绝不渲染任何阵营目标
  if (!revealed) {
    return (
      <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border border-white/10 bg-slate-900/60 p-8 text-center">
        <p className="rounded bg-white/5 px-2 py-1 text-[11px] tracking-widest text-slate-400">
          战前简报 · {index + 1} / {total}
        </p>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">请将设备交给</p>
        <h2 className="font-display text-3xl text-amber-200">{current.name}</h2>
        <div className="w-full rounded-lg border border-white/10 bg-slate-950/40 p-3 text-left">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <EyeOff className="h-3.5 w-3.5" />
            其他玩家请勿查看屏幕
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            下一步会显示 {current.name} 的阵营与胜利条件，这是本局最需要保密的信息之一。
          </p>
        </div>
        <Button onClick={() => setRevealed(true)}>我是 {current.name}，查看我的目标</Button>
      </section>
    )
  }

  // 已确认身份：显示完整阵营卡（含胜利条件与初始数值）
  return (
    <section className="mx-auto max-w-lg space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 text-center">
        <p className="rounded bg-white/5 px-2 py-1 text-[11px] tracking-widest text-slate-400">
          战前简报 · {index + 1} / {total}
        </p>
        <p className="mt-2 text-xs text-slate-500">这是 {current.name} 的专属信息</p>
      </div>

      <div className={`rounded-xl border border-white/10 bg-gradient-to-br p-5 ${f.accent}`}>
        <p className="text-[11px] text-white/50">{current.name}</p>
        <h3 className="font-display text-xl text-white">{f.name}</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/70">{f.summary}</p>

        <div className="mt-3 rounded border border-white/10 bg-black/25 p-3">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300/80">
            <Eye className="h-3 w-3" />
            你的胜利条件
          </p>
          <p className="mt-1 text-sm font-medium text-amber-100">{f.victory.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/70">{f.victory.description}</p>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <p className="text-[10px] text-white/40">人力</p>
            <p className="text-sm font-mono text-rose-200">{f.base.manpower}</p>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <p className="text-[10px] text-white/40">补给</p>
            <p className="text-sm font-mono text-amber-200">{f.base.supply}</p>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <p className="text-[10px] text-white/40">士气</p>
            <p className="text-sm font-mono text-sky-200">{f.base.morale}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <EyeOff className="h-3.5 w-3.5" />
          记住了就遮挡屏幕，交给下一位
        </p>
      </div>

      <Button
        full
        onClick={() => {
          if (isLast) {
            finish()
          } else {
            setIndex(index + 1)
            setRevealed(false)
          }
        }}
      >
        {isLast ? '全部确认完毕，进入第 1 回合' : `记下了，交给下一位（${index + 2}/${total}）`}
      </Button>
    </section>
  )
}

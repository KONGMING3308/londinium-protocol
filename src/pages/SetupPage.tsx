import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Hand, Target, Trophy } from 'lucide-react'
import { loadGame } from '@/api/gameApi'
import { useGameStore } from '@/store/gameStore'
import { Button } from '@/components/Button'

/** 首页三要点：让新玩家在 10 秒内知道这是什么游戏 */
const PITCH = [
  {
    icon: Target,
    title: '你是谁',
    text: '你是六个阵营之一，只有你自己知道自己的胜利条件。这局没有队友。',
  },
  {
    icon: Hand,
    title: '你做什么',
    text: '每回合从 3 张行动牌里选 2 张打出，涨人力／补给／士气，并用指定牌打击别人。',
  },
  {
    icon: Trophy,
    title: '怎么赢',
    text: '一共 7 回合，第 6、7 回合结束时判定。谁先达成自己的独有目标谁就赢。',
  },
]

export function SetupPage() {
  const navigate = useNavigate()
  const startGame = useGameStore((s) => s.startGame)
  const resume = useGameStore((s) => s.resume)
  const [names, setNames] = useState(['', '', '', ''])
  const hasSave = Boolean(loadGame())

  const update = (index: number, value: string) => {
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)))
  }

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-5 rounded-xl border border-white/10 bg-slate-900/50 p-6">
        <h2 className="font-display text-xl text-amber-200">四人热座 · 随机阵营</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          四个人共用一台设备轮流操作。开局从六个阵营中随机抽取四个，且必定至少存在一对敌对势力。
          你只需要知道自己该干什么——至于别人想干什么，得靠猜。
        </p>
      </div>

      {/* 三要点速览 */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
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
        className="mb-5 flex items-center justify-between rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-500/10 to-transparent p-4 transition-colors hover:border-amber-400/60"
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

      <p className="mb-2 text-[11px] text-slate-500">填入四名玩家（留空则自动命名）</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {names.map((name, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <label className="text-[11px] text-slate-400" htmlFor={`p-${i}`}>
              玩家 {i + 1}
            </label>
            <input
              id={`p-${i}`}
              value={name}
              onChange={(e) => update(i, e.target.value)}
              placeholder={`玩家${i + 1}`}
              maxLength={12}
              className="mt-1 w-full rounded border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-amber-400/60"
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => {
          startGame(names)
          navigate('/briefing')
        }}>
          开始新对局
        </Button>
        {hasSave && (
          <Button
            variant="ghost"
            onClick={() => {
              if (resume()) {
                const phase = useGameStore.getState().game?.phase
                navigate(
                  phase === 'briefing' ? '/briefing'
                    : phase === 'resolved' ? '/resolve'
                      : phase === 'result' ? '/result'
                        : '/round',
                )
              }
            }}
          >
            继续上次对局
          </Button>
        )}
      </div>
    </section>
  )
}

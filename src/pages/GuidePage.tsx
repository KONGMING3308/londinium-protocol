/**
 * 新手引导页：把「这游戏怎么玩」拆成 7 个可扫读的步骤。
 * 设计原则：先讲「你要做什么 / 怎么算赢」，术语一律后置并就地解释。
 */
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Coins,
  Flame,
  Hand,
  HelpCircle,
  Lightbulb,
  Shield,
  Swords,
  Target,
  Trophy,
  Users,
} from 'lucide-react'

/** 一回合的四个步骤 */
const ROUND_STEPS = [
  {
    n: 1,
    icon: Users,
    title: '交接设备',
    you: '把手机／电脑递给下一位玩家',
    why: '游戏是「热座」：所有人共用一台设备，轮流操作。交接页会挡住画面，避免别人看到你的手牌。',
  },
  {
    n: 2,
    icon: Hand,
    title: '暗选卡牌',
    you: '从 3 张行动牌里挑 2 张，再决定要不要打出手上的指定牌',
    why: '这是你唯一能改变局势的时刻。选中即锁定，别人看不到你选了什么。',
  },
  {
    n: 3,
    icon: Shield,
    title: '盟约窗口',
    you: '决定要不要结盟，或者撕毁已有的盟约',
    why: '结盟能让你每回合多抽一张「阵营牌」，但盟友的敌人也会变成你的麻烦。',
  },
  {
    n: 4,
    icon: Swords,
    title: '统一结算',
    you: '什么都不用做，看结果',
    why: '四人的选择同时揭晓，系统按固定顺序一起结算——先出牌不代表占便宜。',
  },
]

/** 三条数值 */
const STATS = [
  {
    icon: Flame,
    name: '人力',
    color: 'text-rose-300',
    ring: 'border-rose-400/30 bg-rose-500/5',
    what: '你能动员的兵力',
    tip: '打仗要人，所以强攻类卡牌常常先扣人力。',
  },
  {
    icon: Coins,
    name: '补给',
    color: 'text-amber-300',
    ring: 'border-amber-400/30 bg-amber-500/5',
    what: '你的装备与物资',
    tip: '最容易被打空的一项，围困和掠夺专挑它下手。',
  },
  {
    icon: Shield,
    name: '士气',
    color: 'text-sky-300',
    ring: 'border-sky-400/30 bg-sky-500/5',
    what: '你的凝聚力与合法性',
    tip: '多项胜利条件都盯着士气，但它也是被打击的主要目标。',
  },
]

/** 四种牌 */
const CARD_KINDS = [
  {
    tag: '行动牌',
    count: '每回合 3 张',
    tone: 'border-emerald-400/30 bg-emerald-500/5',
    badge: 'bg-emerald-500/20 text-emerald-200',
    what: '你干活的牌。3 张的战略轴互不相同（强攻／补给线／宣传／转化／情报／冒险）。',
    rule: '只能选 2 张打出。没选的会被弃掉，本轮不再回来。',
  },
  {
    tag: '中立援助',
    count: '每回合 1 张',
    tone: 'border-slate-400/20 bg-slate-500/5',
    badge: 'bg-slate-500/20 text-slate-200',
    what: '六阵营都能用的大众牌，随机发给你。',
    rule: '不占那 2 张的名额，等于白送一次机会——但有 45%–70% 的成功率，失败会小亏一点。',
  },
  {
    tag: '指定牌',
    count: '每回合 1 张',
    tone: 'border-rose-400/30 bg-rose-500/5',
    badge: 'bg-rose-500/20 text-rose-200',
    what: '唯一能主动打别人的牌，必须选一个目标（盟友也能打）。',
    rule: '打出／保留到下一回合／弃掉，三选一。目标有防御牌的话，你可能扑空并被反噬。',
  },
  {
    tag: '阵营牌',
    count: '结盟后才有的加餐',
    tone: 'border-fuchsia-400/30 bg-fuchsia-500/5',
    badge: 'bg-fuchsia-500/20 text-fuchsia-200',
    what: '同盟专属，结算页从 2 张候选里挑 1 张。',
    rule: '下一回合开始前生效，优先级最高。没结盟就没有这个环节。',
  },
]

/** 新手常犯的错 */
const MISTAKES = [
  {
    wrong: '把三条数值里的某一条彻底放空',
    right: '任意一条跌到 0 就立刻崩溃。第一次崩溃会被打去「流亡」（三项重置为 5），第二次就直接出局。宁可平均，也别透支。',
  },
  {
    wrong: '先随便选牌，等结算再看自己要什么',
    right: '你的胜利条件从第 1 回合就该记在心里。阵营不同，该堆的数值完全不同——有人要士气 12，有人要战争进度 3。',
  },
  {
    wrong: '指定牌随手扔出去',
    right: '打空有反噬（通常是 -2 到 -4）。没想好目标，就选「保留到下一回合」，比乱打强。',
  },
  {
    wrong: '觉得结盟只是互相帮忙',
    right: '结盟真正的价值是「阵营牌」——每回合多一次抽取机会，效果还不错。但盟友的仇家也会盯上你。',
  },
  {
    wrong: '以为前 5 回合分不出胜负所以随便玩',
    right: '第 1–5 回合不判胜，但数值会累积到第 6 回合一次性兑现。前面欠的账，后面还不上。',
  },
]

export function GuidePage() {
  return (
    <section className="space-y-5">
      {/* 顶部 */}
      <div className="rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-transparent p-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80">First Time?</p>
        <h2 className="mt-1 font-display text-2xl text-amber-100">新手引导 · 3 分钟读完就能上桌</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          这是一个四人共用一个屏幕的对抗卡牌游戏。你不用记规则，只要先记住下面这一段话。
        </p>
      </div>

      {/* 一句话说清 */}
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-100">你是一个阵营，只有你自己知道你该怎么赢。</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                开局随机发给你一个阵营（萨卡兹、典范军、罗德岛、塔拉、整合运动、市民自救军之一），
                每个阵营的胜利条件都不一样，而且互相冲突。所以这局没有队友，只有交易。
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-100">每回合你会选 2 张牌打出去，用来涨三种数值。</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                人力、补给、士气。数值越高越安全，跌到 0 就会崩溃。你还要用「指定牌」去打击别人。
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-100">游戏一共 7 回合，第 6、7 回合结束时判定胜负。</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                前 5 回合打基础，最后两回合见真章。谁先达成自己的目标，谁就赢——哪怕别人数值比你高。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 一回合流程 */}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-5">
        <p className="mb-1 flex items-center gap-2 text-sm text-amber-200">
          <ArrowRight className="h-4 w-4" />
          一回合会发生这 4 件事
        </p>
        <p className="mb-4 text-[11px] text-slate-500">7 个回合都长这样，熟悉一次就够了。</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROUND_STEPS.map((step) => {
            const Icon = step.icon
            return (
              <div
                key={step.n}
                className="relative rounded-lg border border-white/10 bg-slate-950/40 p-4"
              >
                <span className="absolute right-3 top-2 font-mono text-2xl text-white/10">
                  {step.n}
                </span>
                <Icon className="h-5 w-5 text-amber-300/80" />
                <p className="mt-2 text-sm font-medium text-slate-100">{step.title}</p>
                <p className="mt-1 text-[12px] font-medium leading-relaxed text-emerald-200/90">
                  {step.you}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{step.why}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* 三条数值 */}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-5">
        <p className="mb-1 text-sm text-amber-200">三条数值 = 你的三条命</p>
        <p className="mb-4 text-[11px] text-slate-500">
          范围 0–50。任何一条归零都要崩溃，所以要「都别太低」，而不是「一项特别高」。
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {STATS.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.name} className={`rounded-lg border p-4 ${s.ring}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${s.color}`} />
                  <p className={`text-sm font-medium ${s.color}`}>{s.name}</p>
                </div>
                <p className="mt-1.5 text-[12px] text-slate-300">{s.what}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{s.tip}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* 四种牌 */}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-5">
        <p className="mb-1 text-sm text-amber-200">你会拿到 4 种牌</p>
        <p className="mb-4 text-[11px] text-slate-500">卡牌上写着代价和效果，照着做就行。</p>
        <div className="grid gap-3 md:grid-cols-2">
          {CARD_KINDS.map((c) => (
            <div key={c.tag} className={`rounded-lg border p-4 ${c.tone}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${c.badge}`}>{c.tag}</span>
                <span className="text-[10px] text-slate-500">{c.count}</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-300">{c.what}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{c.rule}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 怎么赢 */}
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-5">
        <p className="mb-1 flex items-center gap-2 text-sm text-emerald-200">
          <Trophy className="h-4 w-4" />
          怎么算赢
        </p>
        <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-300">
          <p>
            每个阵营有自己的目标，比如「士气 ≥12 且未被打断」「战争进度 ≥3」「三线都 ≥12 且有人崩溃过」。
          </p>
          <p>
            <span className="text-amber-200">第 1–5 回合不判胜</span>，第 6 和第 7 回合结束时各判一次。
            如果同一回合多人达成，按 萨卡兹 &gt; 典范军 &gt; 塔拉 &gt; 罗德岛 &gt; 整合运动 &gt; 市民自救军 的顺序算。
          </p>
          <p>
            如果第 7 回合结束没人达成，那就是
            <span className="text-slate-100">「无人获胜」</span>
            ——这不是平局，是所有人都输了。
          </p>
        </div>
        <div className="mt-3 rounded border border-white/10 bg-slate-950/40 p-3">
          <p className="text-[11px] text-slate-400">
            你的具体目标在「战前简报」页和顶栏「对局总览」里随时能查，记不住也没关系。
          </p>
        </div>
      </div>

      {/* 常见错误 */}
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-5">
        <p className="mb-1 flex items-center gap-2 text-sm text-rose-200">
          <AlertTriangle className="h-4 w-4" />
          新手最常犯的 5 个错
        </p>
        <div className="mt-3 space-y-3">
          {MISTAKES.map((m, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <p className="text-[12px] text-rose-300/90">
                <span className="mr-1.5 text-rose-400/60">✗</span>
                {m.wrong}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
                <span className="mr-1.5 text-emerald-400/70">✓</span>
                {m.right}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 下一步 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/rules"
          className="rounded-lg border border-white/10 bg-slate-900/40 p-4 transition-colors hover:border-amber-400/40"
        >
          <p className="flex items-center gap-2 text-sm text-slate-100">
            <BookOpen className="h-4 w-4 text-amber-300" />
            想看完整规则
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            结算顺序、KEY 标签、流亡细节、全部数值表都在规则页。
          </p>
        </Link>
        <Link
          to="/"
          className="rounded-lg border border-white/10 bg-slate-900/40 p-4 transition-colors hover:border-amber-400/40"
        >
          <p className="flex items-center gap-2 text-sm text-slate-100">
            <Lightbulb className="h-4 w-4 text-amber-300" />
            直接开一局
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            边玩边学最快。第一局就当练手，第 2 回合基本就懂了。
          </p>
        </Link>
      </div>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-slate-600">
        <HelpCircle className="h-3.5 w-3.5" />
        还有看不懂的地方？规则页末尾有常见疑问速查。
      </p>
    </section>
  )
}

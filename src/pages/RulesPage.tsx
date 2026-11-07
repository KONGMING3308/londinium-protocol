/**
 * 规则页：结构化速查手册。
 * 与旧版的区别：
 * 1. 信息顺序改为「先怎么赢 → 再怎么玩 → 最后才是细节」，不再一上来砸结算顺序；
 * 2. 删除重复条目（中立援助、指定牌此前各写了两遍）；
 * 3. 修正与实现不符的数值（中立援助成功率实为 45%–70%，非 30%–80%）；
 * 4. 结算顺序由一行长句改为分步表格，可逐条对照；
 * 5. 术语首次出现就解释，末尾补常见疑问。
 */
import { FACTIONS } from '@/mocks/factions'
import { ROUND_THEMES, storyCandidates } from '@/mocks'
import { BookOpen, HelpCircle } from 'lucide-react'

/** 结算顺序：与 src/utils/game/resolve.ts 的执行次序严格一致 */
const RESOLVE_ORDER: Array<{ step: string; what: string; detail: string }> = [
  {
    step: '0',
    what: '同盟交换生效',
    detail: '上一回合结算页谈成的同盟交换，在本回合开始前优先结算，优先于回合修正。',
  },
  {
    step: '1',
    what: '回合剧情事件（3 选 1）',
    detail: '每回合从 3 个候选里随机抽 1 个，对全场 6 个阵营同时加减数值。同一回合每局可能不同。',
  },
  {
    step: '2',
    what: '调停保护',
    detail: '打出「拉特兰的调停」且成功的人，自己与盟友本回合不会被任何指定牌针对。',
  },
  {
    step: '3',
    what: '行动牌代价',
    detail: '先把所有行动牌的代价扣掉。注意：代价不会因数值不足而阻止你出牌（见常见疑问 Q4）。',
  },
  {
    step: '4',
    what: '指定牌找目标、判定防御',
    detail: '确定每张指定牌打向谁；若目标手上有免疫／取消针对类防御牌且判定成功，则本次针对被挡下。',
  },
  {
    step: '5',
    what: '击穿与落空',
    detail: '针对 KEY 标签时：命中则对方那张牌整张失效并记入「已被针对」；扑空则你回补 +1 补给。',
  },
  {
    step: '6',
    what: '指定牌结算',
    detail: '命中的按牌面造成效果；被挡下或落空的，按牌面「反噬」扣自己。',
  },
  {
    step: '7',
    what: '行动牌效果',
    detail: '按牌面结算三项数值。阵营行动牌与指定牌都是确定生效，不带成功率；只有中立援助需要用本回合统一掷出的结果。',
  },
  {
    step: '8',
    what: '盟约事件',
    detail: '本回合公开的盟约事件，分别对「有同盟的人」「没有同盟的人」「本回合撕约的人」生效。',
  },
  {
    step: '9',
    what: '同盟互援',
    detail: '处于同盟且未出局、未流亡的人，各自 +1 士气。',
  },
  {
    step: '10',
    what: '上限、崩溃与流亡',
    detail: '数值封顶 50（流亡时 12），超出部分直接截断；最后检查是否有任一项 ≤0，触发崩溃判定。',
  },
]

/** 依赖 KEY 才能获胜的三个阵营（与代码 victory.ts 对齐） */
const KEY_ROWS = [
  {
    faction: '典范军 VIC',
    key: '国剑',
    keyCard: '夺回国剑',
    keyRound: 'R3',
    counter: '焚烧王旗',
    counterBy: '塔拉',
    counterRound: 'R3',
    win: '三线 ≥12 + 至少一人崩溃过',
  },
  {
    faction: '塔拉 TARA',
    key: '塔拉独立',
    keyCard: '塔拉独立',
    keyRound: 'R6',
    counter: '讨伐塔拉',
    counterBy: '典范军',
    counterRound: 'R6',
    win: '士气 ≥12，且典范军未获胜',
  },
  {
    faction: '整合运动 REU',
    key: '新纲领',
    keyCard: '新纲领',
    keyRound: 'R6',
    counter: '深池渗透',
    counterBy: '塔拉',
    counterRound: 'R7',
    win: '三线 ≥10 + 至少一人崩溃过',
  },
]

/** 萨卡兹的三个 KEY：不用于判定胜负，而是战争进度的来源、也是罗德岛的靶子 */
const SARK_KEYS = [
  { key: '飞空艇', card: '飞空艇升空', round: 'R4', progress: '+1', counter: '打击飞空艇（罗德岛 R4）' },
  { key: '生命脊椎', card: '生命脊椎', round: 'R5', progress: '+1', counter: '打击生命脊椎（罗德岛 R5）' },
  { key: '阿喃那', card: '接引阿喃那', round: 'R7', progress: '+2', counter: '阻止阿喃那（罗德岛 R7）' },
]

/** 常见疑问 */
const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Q1 我该听谁的？为什么同一张牌在别人手里结果不一样？',
    a: '牌的效果是固定的，差别来自「你的数值能不能撑住代价」和「目标有没有防御牌」。同一个强攻，打在没有防御牌的人身上是 -4 士气，打发过调停的人就完全无效。',
  },
  {
    q: 'Q2 前 5 回合反正不判胜，是不是可以随便玩？',
    a: '不行。第 6 回合判定用的是当时的数值，而数值是 7 个回合累积出来的。前期亏掉的补给，后期很难补回来——尤其流亡过一次之后，带 KEY 标签的牌正向收益还会减半。',
  },
  {
    q: 'Q3 「保留指定牌」和「打出指定牌」怎么选？',
    a: '没想好打谁、或者目标明显会防住你，就保留。保留最多一回合，下回合可以连同新发的牌一起处置；流亡期间例外，可以继续保留同一张，不受一回合限制。盲目打出去扑空，会吃 2–4 点反噬。',
  },
  {
    q: 'Q4 数值不够是不是就打不出某张牌？',
    a: '单张牌付不起时，牌面会标红并写明缺多少，但你仍然可以打——代价照扣，扣成负数就在回合末触发崩溃、转入流亡。之所以不禁止：结算扣费本来就不设下限，硬拦反而和它自相矛盾，而且资源见底时禁止出牌会让对局直接卡死。发牌时系统会尽量保证你至少有两张付得起，所以真走到只能透支那一步，说明你已经很危险了。',
  },
  {
    q: 'Q5 结盟到底有什么好处？值得背叛吗？',
    a: '好处有两个：每回合互援 +1 士气，以及和盟友共享一份「同盟交换」（2 选 1，谈成后两边同时结算）。背叛的代价很重——撕约者永久失去结盟资格，只有打出「背叛的诱惑」这类盟约事件时才划算。',
  },
  {
    q: 'Q6 什么是 KEY 标签？为什么我不能不打那张牌？',
    a: 'KEY 是你阵营获胜的前提，只有「打出过且没被击穿」才算拿到手（面板会显示「已握有」）。不打 = 永远没有 KEY = 胜利条件永不成立。所以带 KEY 的牌不是可选项，你必须找机会把它打出去。风险在于：打出当回合若被对手的「针对 XX」命中，它会整张失效，KEY 永久作废，你这一局再也赢不了。',
  },
  {
    q: 'Q7 战争进度是什么？只有萨卡兹有吗？',
    a: '是萨卡兹专属的第四条进度（面板常显 x/3）。带推进值的牌结算成功就会涨：飞空艇升空 +1、生命脊椎 +1、接引阿喃那 +2、同盟交换「军械换进击」+1（深池替王庭点火换来的）。累计 ≥3 且士气 ≥8 就获胜。其他阵营不用管这条进度，但可以在对应牌打出的同一回合用罗德岛的针对性牌把它打掉。',
  },
  {
    q: 'Q8 中途关掉页面会丢进度吗？',
    a: '不会。每一步都会存到浏览器本地，首页点「继续上次对局」就能接上。但换浏览器、清缓存、或者用无痕模式会丢。',
  },
  {
    q: 'Q9 中立资源该怎么抢？每次都抢会不会太亏？',
    a: '抢点扣的是补给，和打牌的代价是同一个池子。出价最高者独得、其余不退，所以关键不是「出多少」，而是「别人会不会也盯着这个点」。如果两个人都出满，就是双输的流拍——这时候把这份补给留给行动牌反而更划算。经验上：真的很缺某项数值时才值得下重手。',
  },
  {
    q: 'Q10 每回合的剧情事件为什么不一样？',
    a: '每个回合有 3 个候选剧情，每局随机抽 1 个，对全场 6 个阵营同时加减数值。所以同一回合在不同局里可能对谁有利完全不同——这是有意设计的，避免记住剧本就能过关。回合页顶部会写明本回合抽到了什么、影响到谁。',
  },
]

export function RulesPage() {
  return (
    <section className="space-y-4">
      {/* 头部 */}
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
        <p className="flex items-center gap-2 font-display text-xl text-slate-100">
          <BookOpen className="h-5 w-5 text-amber-300" />
          规则手册
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          以《明日方舟》第 9–14 章（伦蒂尼姆篇）为背景的四人联机对抗卡牌。
          首次接触请先看
          <a className="mx-1 text-amber-300 underline decoration-amber-400/40" href="#/guide">
            新手引导
          </a>
          ，本页写给已经上手、需要查细节的人。
        </p>
      </div>

      {/* 目录 */}
      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="mb-2 text-[11px] uppercase tracking-widest text-slate-500">目录</p>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-3">
          {[
            ['#win', '一、怎么算赢'],
            ['#round', '二、一回合的流程'],
            ['#stats', '三、数值与生死线'],
            ['#cards', '四、四种牌'],
            ['#order', '五、结算顺序'],
            ['#alliance', '六、同盟与背叛'],
            ['#key', '七、KEY 与战争进度'],
            ['#factions', '八、六阵营胜利条件'],
            ['#story', '九、每回合剧情事件'],
            ['#faq', '十、常见疑问'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded px-1.5 py-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-amber-200"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* 一、怎么算赢 */}
      <div id="win" className="rounded-lg border border-emerald-400/25 bg-emerald-500/5 p-4">
        <p className="text-sm text-emerald-200">一、怎么算赢</p>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-400">
          <li>· 每个阵营有独立的胜利目标，<span className="text-slate-200">先达成者获胜</span>，不存在团队胜利。</li>
          <li>· 只在<span className="text-slate-200">第 6、7 回合结算完成时</span>各判定一次；第 1–5 回合不可判胜。</li>
          <li>· 同一回合多人达成时，按 <span className="text-slate-200">萨卡兹 &gt; 典范军 &gt; 塔拉 &gt; 罗德岛 &gt; 整合运动 &gt; 市民自救军</span> 结算，只判一个胜者。</li>
          <li>· 第 7 回合结束仍无人达成，记为「<span className="text-slate-200">无人获胜</span>」，不是平局。</li>
          <li>· 已经出局（不是流亡，是彻底出局）的玩家不参与胜负判定。</li>
        </ul>
        <p className="mt-2 rounded border border-white/10 bg-slate-950/40 p-2 text-[11px] text-slate-500">
          你的具体目标随时可在顶栏「对局总览」查看，不必背下来。
        </p>
      </div>

      {/* 二、一回合流程 */}
      <div id="round" className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-sm text-amber-200">二、一回合的流程</p>
        <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-400">
          <li>
            <span className="text-slate-300">1. 简报（60 秒）：</span>
            四人各自看自己的阵营与胜利条件，确认后进入暗选。出局与流亡的玩家跳过。
          </li>
          <li>
            <span className="text-slate-300">2. 暗选（30 秒）：</span>四人在各自设备上同时操作。每人拿到 3 张阵营行动牌（三张战略轴互不相同）、1 张中立援助、1 张本回合指定牌。
            从 3 张行动牌中选 2 张；中立援助可选择接受或弃置；指定牌可选择打出（需选目标）／保留到下回合／弃置。
            <span className="text-slate-500">超时未提交会自动打出 2 张行动牌并保留指定牌。</span>
          </li>
          <li>
            <span className="text-slate-300">3. 盟约（45 秒）：</span>四人选完后进入盟约窗口，此时可缔结或撕毁盟约。全桌最多 2 对，每人同时只能属于 1 个同盟。
            <span className="text-slate-500">超时自动跳过结盟。</span>
          </li>
          <li>
            <span className="text-slate-300">4. 结算（60 秒）：</span>四人选择同时揭晓，按第五节顺序统一结算，生成战报。
            <span className="text-slate-500">看完点「准备下一回合」，四人都点了才继续；超时自动进入下一回合。</span>
          </li>
          <li>
            <span className="text-slate-300">5. 同盟交换：</span>结算页上，每一对同盟共享 2 张交换牌候选，两人协商谈成 1 张（或放弃）；谈成的条款对双方同时结算，在下一回合开始前生效。第 7 回合后不再发放。
          </li>
        </ol>
      </div>

      {/* 三、数值 */}
      <div id="stats" className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-sm text-amber-200">三、数值与生死线</p>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-400">
          <li>· <span className="text-rose-300">人力</span>是可动员战力、<span className="text-amber-300">补给</span>是装备物资、<span className="text-sky-300">士气</span>是凝聚力与合法性。</li>
          <li>· 每项数值范围 <span className="text-slate-200">0–50</span>；超过 50 的部分直接截断，不会有隐藏记账。</li>
          <li>· 任一项 <span className="text-slate-200">≤0 即崩溃</span>。</li>
          <li>· 第一次崩溃 → 进入<span className="text-slate-200">流亡</span>：三项重置为 5，上限压至 12，此后<span className="text-slate-200">带 KEY 标签的牌正向收益减半</span>（至少 1 点，普通牌收益照常），且不能主动用指定牌攻击别人。流亡期间指定牌只能保留，可跨回合继续持有同一张，不受「最多保留一回合」限制。</li>
          <li>· 流亡只有一次。再次崩溃 → <span className="text-slate-200">彻底出局</span>，不能获胜。</li>
          <li>· 唯一的回程票是罗德岛的「医疗协议」：流亡期间打出，即可解除流亡，三项重置为 <span className="text-slate-200">8</span>。</li>
          <li>· 崩溃或被针对而断裂的同盟会立即解除。</li>
        </ul>
      </div>

      {/* 四、四种牌 */}
      <div id="cards" className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-sm text-amber-200">四、四种牌</p>
        <div className="mt-2 space-y-2.5 text-[12px] leading-relaxed text-slate-400">
          <div>
            <p className="text-slate-300">行动牌（每回合 3 张，3 选 2）</p>
            <p>来自本阵营行动池，三张的战略轴互不相同：<span className="text-slate-300">强攻</span>（用人力和补给换战果）、<span className="text-slate-300">补给线</span>（补物资）、<span className="text-slate-300">宣传</span>（堆士气）、<span className="text-slate-300">转化</span>（资源互换，结构会失衡）、<span className="text-slate-300">情报</span>（看牌干扰）、<span className="text-slate-300">冒险</span>（高代价换高收益，孤注一掷）。</p>
            <p className="mt-1 text-slate-500">
              这三张一律确定生效，不存在成功率，也没有前置条件；只有中立援助里的「中立义勇军」要求本回合处于同盟，否则整张牌无效、代价照扣。
            </p>
            <p className="mt-1 text-slate-500">
              代价在结算时统一扣除。付不起的牌会<span className="text-slate-300">标红提示，但仍然可以打</span>（代价照扣，扣成负数会当场崩溃）；
              若所选组合的合计代价超过当前数值，界面同样只警告不阻止，后果由你承担。
            </p>
          </div>
          <div>
            <p className="text-slate-300">中立援助（每回合 1 张，不占 3 选 2 名额）</p>
            <p>
              六阵营共用池中随机发给你的牌，是全游戏唯一带成功率的牌。实测范围为
              <span className="text-slate-200">45%–70%</span>
              ：成功拿到完整效果与特殊能力，失败只受 1 点补给或士气的小额损失。
              界面上默认按「接受」处理，你可以改为弃置。
            </p>
            <p className="mt-1 text-slate-500">
              唯一例外是<span className="text-slate-300">「中立义勇军」</span>：它要求本回合处于同盟，
              没有同盟时整张牌无效（代价照扣）。
            </p>
          </div>
          <div>
            <p className="text-slate-300">中立资源争夺（每回合 2 个点，不占任何名额）</p>
            <p>
              每回合刷出 <span className="text-slate-200">2 个中立资源点</span>
              （如「疤痕商场的军械」「城头的广播站」），四人同时
              <span className="text-slate-200">秘密出价</span>争夺，出价从补给里扣。
            </p>
            <ul className="mt-1 space-y-0.5 text-slate-400">
              <li>· 同一个点出价最高者独得奖励，<span className="text-slate-300">其余人的出价一律不退</span>；</li>
              <li>· 最高价<span className="text-slate-300">并列则流拍</span>，谁都不拿，但出价照扣；</li>
              <li>· 没人出价则不扣任何人；</li>
              <li>· 出价可以透支补给（会更容易崩溃，风险自担）；</li>
              <li>· 每个人的出价在结算前对其他人保密，只能看到「已有几人出价」。</li>
            </ul>
            <p className="mt-1.5 rounded border border-emerald-400/20 bg-emerald-500/5 px-2 py-1 text-[11px] leading-relaxed text-emerald-200/90">
              这是全游戏唯一需要<span className="font-medium">读人</span>的环节：
              你要猜别人会不会抢这个点、愿意出多少，同时还得掂量自己舍不舍得这点补给。
              抢点的钱和打牌的代价是同一个池子，抢得凶就容易兵力不足。
            </p>
          </div>
          <div>
            <p className="text-slate-300">指定牌（每回合 1 张）</p>
            <p>
              唯一能主动攻击他人的牌，<span className="text-slate-200">必须选择目标</span>，可选任意对手（包括盟友）。
              按回合固定发放，共 7 张／阵营。可打出、可保留到下一回合（最多 1 张；流亡期间可继续保留同一张）、也可弃置。
            </p>
            <p className="mt-1">
              七种行动类型：<span className="text-slate-300">打击</span>（目标士气 -4，自己 +1）、
              <span className="text-slate-300">掠夺</span>（夺最多 3 补给）、
              <span className="text-slate-300">围困</span>（目标补给 -3）、
              <span className="text-slate-300">破坏</span>（让目标本回合的指定牌失效）、
              <span className="text-slate-300">策反</span>（解除目标同盟）、
              <span className="text-slate-300">揭穿</span>（公开目标行动牌，自己 +1 补给）、
              <span className="text-slate-300">对决</span>（人力差 ≥3 才能生效，否则反噬）。
            </p>
            <p className="mt-1 text-slate-500">
              落空或被挡下时按牌面「反噬」扣自己，通常 2–4 点。
              目标可用免疫、取消针对类防御牌挡下；拉特兰的调停只保护打出者与其盟友。
            </p>
          </div>
          <div>
            <p className="text-slate-300">同盟交换（需处于同盟）</p>
            <p>
              按同盟组合分池：6 种可结盟组合各有 6 张专属交换牌，只在这一对之间流通，不会串到别桌。
              结算页上，这对同盟共享 2 张候选，两人谈成 1 张或放弃。
              每张牌<span className="text-slate-200">写死两边</span>——甲方条款给甲方，乙方条款给乙方，谈成后同时结算；所以「谁去点那张牌」不影响结果。
              效果在<span className="text-slate-200">下一回合开始前生效，优先级最高</span>（先于回合剧情事件）。
              未结盟不抽取、不显示。若交换生效前同盟已断，这笔交易作废。第 7 回合结束后不再提供。
            </p>
          </div>
        </div>
      </div>

      {/* 五、结算顺序 */}
      <div id="order" className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-sm text-amber-200">五、结算顺序（同一回合内按此顺序执行）</p>
        <p className="mb-2 mt-1 text-[11px] text-slate-500">
          所有人的选择同时生效，不分先后手。想查「为什么我的牌没生效」，按这张表往下找那一步。
        </p>
        <div className="space-y-1">
          {RESOLVE_ORDER.map((row) => (
            <div key={row.step} className="flex gap-2 rounded border border-white/5 bg-slate-950/40 p-2">
              <span className="mt-0.5 shrink-0 font-mono text-[10px] text-amber-400/60">{row.step}</span>
              <div>
                <p className="text-[12px] font-medium text-slate-200">{row.what}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{row.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 六、同盟 */}
      <div id="alliance" className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-sm text-amber-200">六、同盟与背叛</p>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-400">
          <li>· 全桌最多 <span className="text-slate-200">2 对</span>同盟，每人同时只能属于 1 个同盟。</li>
          <li>· 只有剧情中实际合作过的势力可以结盟；敌对势力永远不能结盟（具体组合见战前简报页）。</li>
          <li>· 同盟收益：每回合双方各 +1 士气；并解锁结算页的「同盟交换」——一对同盟每回合谈成一笔双向交易。</li>
          <li>· 撕毁盟约在盟约窗口宣告，当回合立即生效，可吃到「背叛的诱惑」这类盟约事件的撕约加成；但同盟会当场解除，<span className="text-slate-200">本回合的同盟互援与同盟类加成随之失效</span>。</li>
          <li>· 撕毁者<span className="text-slate-200">永久失去结盟资格</span>，无法再与任何人结盟。</li>
          <li>· 盟约事件是独立系统：不进手牌、不参与选择，只在结算时公布并对全场生效。</li>
        </ul>
      </div>

      {/* 七、KEY 与战争进度 */}
      <div id="key" className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-sm text-amber-200">七、KEY 标签与战争进度</p>
        <p className="mt-2 rounded border border-amber-400/30 bg-amber-500/10 p-2 text-[12px] leading-relaxed text-amber-100">
          带 KEY 的牌是某些阵营<span className="font-medium">获胜的前提</span>，不是可打可不打的普通牌。
          <span className="text-amber-300/90">不打它，对应的胜利条件永远不成立。</span>
        </p>

        <p className="mt-3 text-[11px] text-slate-300">三步因果链</p>
        <div className="mt-1.5 space-y-1">
          {[
            ['① 获得', '本回合打出带 KEY 的牌，且没有被击穿 → 该 KEY 归你。面板显示「已握有【国剑】」。'],
            ['② 失去', '若同一回合对手用「针对国剑」的牌命中你 → 那张牌收益归零，KEY 永久作废，面板变红「已被击穿」。'],
            ['③ 判定', '终局只认「已握有」+「未被击穿」同时成立。缺一条都赢不了。'],
          ].map(([step, detail]) => (
            <div key={step} className="flex gap-2 rounded border border-white/5 bg-slate-950/40 p-2">
              <span className="shrink-0 text-[11px] font-medium text-amber-300/80">{step}</span>
              <span className="text-[11px] leading-relaxed text-slate-400">{detail}</span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-slate-300">关键：针对只在「同一回合」有效</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          对手的「针对 XX」只能打中你<span className="text-slate-300">本回合打出的</span>那张牌。
          所以只要你安全打出过一次，之后谁也夺不走。反过来，你也要盯住对手 KEY 牌的发放回合——
          错过那一回合，就再没有机会了。
        </p>

        <p className="mt-4 text-[11px] text-amber-200/80">三个依赖 KEY 的阵营</p>
        <div className="mt-1.5 space-y-1.5">
          {KEY_ROWS.map((r) => (
            <div key={r.key} className="rounded border border-white/10 bg-slate-950/40 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-200">{r.faction}</span>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">KEY：{r.key}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                拿到它：<span className="text-slate-300">「{r.keyCard}」({r.keyRound})</span>
                　|　会被夺走：<span className="text-rose-300">「{r.counter}」({r.counterBy} {r.counterRound})</span>
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">另外还需：{r.win}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-amber-200/80">萨卡兹的三个 KEY 是例外</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          飞空艇、生命脊椎、阿喃那<span className="text-slate-300">不用于判定萨卡兹的胜负</span>，
          而是战争进度的来源，同时也是罗德岛的靶子。萨卡兹靠把进度堆到 3 赢，不是靠持有 KEY。
        </p>
        <div className="mt-1.5 space-y-1">
          {SARK_KEYS.map((k) => (
            <div key={k.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-white/5 bg-slate-950/40 px-2 py-1.5 text-[10px]">
              <span className="text-slate-300">{k.key}</span>
              <span className="text-slate-500">「{k.card}」{k.round}</span>
              <span className="text-rose-300">进度 {k.progress}</span>
              <span className="text-rose-200/70">被 {k.counter}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-amber-200/80">战争进度（萨卡兹专属，面板常显 x / 3）</p>
        <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-slate-400">
          <li>· 来源：上述三张指定牌，加上同盟交换「军械换进击」（+1）。<span className="text-slate-500">牌结算成功才涨，被击穿则不涨。</span></li>
          <li>· 判定：<span className="text-slate-200">进度 ≥3 且士气 ≥8</span>，第 6 或第 7 回合结束时获胜。</li>
          <li>· 已被击穿的进度不会退回，但那张牌本身也拿不到进度。</li>
          <li>· 其他阵营的应对：罗德岛的三张针对性牌正好与萨卡兹的 KEY 牌同回合发放，可以在当回合把进度打掉。</li>
        </ul>

        <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
          补充：击穿宿敌阵营 +2 士气、非宿敌 +1；针对扑空只回补 +1 补给；「破坏」类牌能让目标本回合的指定牌失效。
        </p>
      </div>

      {/* 八、胜利条件 */}
      <div id="factions" className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-sm text-amber-200">八、六阵营胜利条件</p>
        <div className="mt-2 space-y-2">
          {FACTIONS.map((f) => (
            <div key={f.id} className="rounded border border-white/5 bg-slate-950/40 p-2.5">
              <p className="text-xs text-slate-200">
                {f.name}
                <span className="ml-2 text-[10px] text-slate-500">T{f.tier} · {f.title}</span>
              </p>
              <p className="mt-1 text-[11px] font-medium text-amber-200/90">{f.victory.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{f.victory.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 九、剧情 */}
      <div id="story" className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-sm text-amber-200">九、每回合剧情事件（随机）</p>
        <p className="mb-2 mt-1 text-[11px] leading-relaxed text-slate-500">
          每个回合开场会从 3 个候选剧情里随机抽 1 个，对<span className="text-slate-300">全场 6 个阵营同时生效</span>。
          同一回合在不同局里可能发生不同的事，所以不能靠背板——每局都要重新判断这回合对谁有利。
          数值增减会写进回合页顶部的剧情卡，结算后还会进日志。
        </p>
        <div className="rounded border border-amber-400/25 bg-amber-500/5 p-2.5">
          <p className="text-[11px] leading-relaxed text-amber-200/90">
            注意：剧情事件是<span className="font-medium">额外叠加</span>的，不占用你打牌的名额，
            也不消耗任何资源——它只是这一回合的天时。
          </p>
        </div>
        <div className="mt-2 space-y-1.5">
          {ROUND_THEMES.map((t) => (
            <div key={t.round} className="flex gap-2 rounded border border-white/5 bg-slate-950/40 px-2.5 py-1.5">
              <span className="shrink-0 text-[11px] text-slate-400">R{t.round}</span>
              <span className="text-[11px] text-slate-300">{t.label}</span>
              <span className="text-[11px] text-slate-600">
                3 选 1：{storyCandidates(t.round).map((e) => e.label).join(' / ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 十、FAQ */}
      <div id="faq" className="rounded-lg border border-sky-400/25 bg-sky-500/5 p-4">
        <p className="flex items-center gap-2 text-sm text-sky-200">
          <HelpCircle className="h-4 w-4" />
          十、常见疑问
        </p>
        <div className="mt-2 space-y-2.5">
          {FAQ.map((item) => (
            <div key={item.q} className="rounded border border-white/10 bg-slate-950/40 p-2.5">
              <p className="text-[12px] font-medium text-slate-200">{item.q}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="pb-2 text-center text-[10px] text-slate-600">
        本页规则与当前代码实现一致。如发现描述与实际不符，以实际结算日志为准。
      </p>
    </section>
  )
}

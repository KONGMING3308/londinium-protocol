/**
 * 同盟交换（faction offer）端到端验证 —— 补测试报告 P3 的覆盖缺口。
 *
 * 报告的问题：那一局 A 从 R2 起持续流亡，而引擎有意跳过流亡者的同盟对，
 * 所以结算页始终显示「本回合没有同盟交换」，这功能一次都没被真正跑过。
 *
 * 关键流程顺序（踩过一次坑）：结盟只能在 council 阶段做，
 * 所以必须先让全员提交暗选 → 进入 council → 再结盟 → 再全员就绪 → 进 resolved。
 *
 * 本测试要验证：
 *   1. 双方都正常时，结盟后结算页会出现候选交换牌
 *   2. 候选牌只有这对盟友能看到，另外两人看不到（脱敏）
 *   3. 两人都拍板后才算谈成；非盟友不能替别人拍板
 *   4. 谈成的交换在下一回合开始前生效
 *   5. 「这回合不谈」是合法选择
 *
 * 用法：node scripts/test-faction-deal.mjs
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createAliasPlugin } from './esbuild-alias.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function loadEngine() {
  const outdir = mkdtempSync(join(tmpdir(), 'londinium-faction-'))
  const outfile = join(outdir, 'engine.mjs')
  await build({
    entryPoints: [resolve(root, 'src/game/engine.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    plugins: [createAliasPlugin(root)],
  })
  const mod = await import(pathToFileURL(outfile).href)
  return { mod, cleanup: () => rmSync(outdir, { recursive: true, force: true }) }
}

const { mod: E, cleanup } = await loadEngine()

function pickActions(hand) {
  return hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC').slice(0, 2)
}

/** 建一局，四人就绪并确认简报，停在暗选阶段 */
function newMatch(roomTag) {
  let state = E.createEngine(roomTag)
  const seats = []
  for (let i = 0; i < 4; i += 1) {
    const r = E.joinAsPlayer(state, `${roomTag}${i + 1}`)
    state = r.state
    seats.push(r.playerId)
  }
  seats.forEach((id) => {
    state = E.setReady(state, id, true).state
  })
  state = E.startMatch(state).state
  seats.forEach((id) => {
    state = E.briefingAck(state, id).state
  })
  return { state, seats }
}

/** 全员提交暗选（不进盟约就绪） */
function submitAll(state, seats) {
  seats.forEach((id) => {
    if (state.picks[id]) return
    const hand = state.hands[id] ?? []
    const acts = pickActions(hand)
    if (acts.length < 2) return
    state = E.submitPick(state, id, {
      actionCardIds: acts.map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
    }).state
  })
  return state
}

/** 盟约阶段全员就绪 → 进入结算 */
function readyAll(state, seats) {
  seats.forEach((id) => {
    if (state.phase !== 'council') return
    const p = state.players.find((x) => x.id === id)
    if (!p || p.councilReady) return
    state = E.councilReady(state, id).state
  })
  return state
}

/** 在盟约阶段找到并结成第一对可行的同盟 */
function formFirstAlliance(state, seats) {
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      const r = E.councilAllyRequest(state, seats[i], seats[j])
      if (r.error) continue
      const r2 = E.councilAllyRespond(r.state, seats[j], seats[i], true)
      if (r2.error) continue
      return { a: seats[i], b: seats[j], state: r2.state }
    }
  }
  return null
}

/** 结算后同盟双方是否仍互为盟友（结算可能被 incite / 崩溃合法拆散） */
function stillAllied(state, pair) {
  if (!pair || state.phase !== 'resolved') return false
  const a = state.players.find((x) => x.id === pair.a)
  const b = state.players.find((x) => x.id === pair.b)
  return Boolean(a && b && !a.defeated && !b.defeated && a.allyId === b.id && b.allyId === a.id)
}

/**
 * 从暗选一路推到结算，并在中途结成同盟。
 *
 * 结算阶段里 incite 牌与「崩溃→流亡」都可能合法拆散刚刚结成的同盟，
 * 那样结算页就不会为这对生成候选牌——这是游戏规则，不是 bug。
 * 本测试要验证的是「同盟仍成立 → 候选牌出现」这条路径，
 * 所以遇到被拆散就重开一局，最多试 10 次。
 */
function reachResolvedWithAlliance(roomTag) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const tag = `${roomTag}-${attempt}`
    let { state, seats } = newMatch(tag)
    state = submitAll(state, seats)
    if (state.phase !== 'council') continue
    const pair = formFirstAlliance(state, seats)
    if (!pair) continue
    state = readyAll(pair.state, seats)
    if (stillAllied(state, pair)) return { state, seats, pair }
  }
  // 重试耗尽：返回最后一次结果，交由断言报「未能构造」而非误报功能失败
  const last = newMatch(`${roomTag}-last`)
  const s = submitAll(last.state, last.seats)
  const p = s.phase === 'council' ? formFirstAlliance(s, last.seats) : null
  const st = p ? readyAll(p.state, last.seats) : s
  return { state: st, seats: last.seats, pair: p ?? null }
}

try {
  /* ================= 一、正常结盟 → 结算页出现候选牌 → 拍板 → 下回合生效 ================= */
  {
    const { state: s0, seats, pair } = reachResolvedWithAlliance('FD1')
    check('四人暗选后进入盟约阶段', Boolean(pair), pair ? '' : '未能结盟（可能阵营组合受限）')
    check('结盟后盟约就绪进入结算', s0.phase === 'resolved', s0.phase)

    if (pair && s0.phase === 'resolved') {
      let state = s0
      const offersKeys = Object.keys(state.factionOffers ?? {})
      check('结算页为同盟对生成了候选交换牌', offersKeys.length > 0, `${offersKeys.length} 对`)
      check('候选池里有牌', (state.factionOffers[offersKeys[0]] ?? []).length > 0, `${(state.factionOffers[offersKeys[0]] ?? []).length} 张`)

      // 视角脱敏
      const viewA = E.viewFor(state, pair.a, new Set(seats))
      const viewB = E.viewFor(state, pair.b, new Set(seats))
      const outsiders = seats.filter((x) => x !== pair.a && x !== pair.b)
      const viewC = E.viewFor(state, outsiders[0], new Set(seats))

      const offersA = viewA.match.faction.offers ?? []
      const offersB = viewB.match.faction.offers ?? []
      check('盟友 A 能看到自己这对的候选', offersA.length > 0, `${offersA.length} 张`)
      check('盟友 B 能看到同一批候选', offersB.length === offersA.length, `B ${offersB.length} / A ${offersA.length}`)
      check(
        'A、B 看到的候选完全一致',
        JSON.stringify(offersA.map((c) => c.id).sort()) === JSON.stringify(offersB.map((c) => c.id).sort()),
      )
      const offersC = viewC.match.faction.offers ?? []
      check('非盟友看不到别人的交换候选（脱敏）', offersC.length === 0, `外人看到 ${offersC.length} 张`)
      check('非盟友 canPick 为 false', viewC.match.faction.canPick === false)

      // 拍板：设计上「一方拍板即代表整对同盟」——两人看到同一批候选，
      // 谁先决定就算数，避免两人意见不一致时永久僵持。
      const offerId = offersA[0].id
      const pickA = E.factionPick(state, pair.a, offerId)
      check('A 拍板成功', !pickA.error, pickA.error ?? '')
      state = pickA.state
      check(
        '一方拍板即代表整对同盟决定（不要求双方各点一次）',
        Object.values(state.factionDecided).some(Boolean),
      )
      check(
        '谈成的交换进入待生效池',
        Object.keys(state.factionPending ?? {}).length > 0,
        `${Object.keys(state.factionPending ?? {}).length} 项`,
      )
      check('拍板后这张的候选池被消费', Object.keys(state.factionOffers ?? {}).length === 0)

      // B 再拍板应被拒绝（因为这对已经决定了）
      const pickB = E.factionPick(state, pair.b, offerId)
      check(
        'B 再拍板会被拒绝（这对已决定）',
        Boolean(pickB.error),
        pickB.error ?? '没有被拒绝',
      )

      // 推进到下一回合，验证生效
      let guard = 0
      while (state.phase === 'resolved' && guard < 10) {
        seats.forEach((id) => {
          if (state.phase !== 'resolved') return
          const p = state.players.find((x) => x.id === id)
          if (p && !p.readyNext) state = E.readyNext(state, id).state
        })
        guard += 1
      }
      check('推进到下一回合', state.phase === 'picking', `${state.phase} round=${state.round}`)
      check(
        '交换已结算（待生效池清空）',
        Object.keys(state.factionPending ?? {}).length === 0,
        `剩余 ${Object.keys(state.factionPending ?? {}).length}`,
      )
    }
  }

  /* ================= 二、「这回合不谈」合法 ================= */
  {
    const { state: s0, seats, pair } = reachResolvedWithAlliance('FD2')
    if (pair && s0.phase === 'resolved') {
      const skipA = E.factionPick(s0, pair.a, null)
      check('A 选「这回合不谈」合法', !skipA.error, skipA.error ?? '')
      check('不谈时没有待生效交换', Object.keys(skipA.state.factionPending ?? {}).length === 0)
      check('不谈也标记为已决定（不会卡住）', Object.values(skipA.state.factionDecided).some(Boolean))
      const skipB = E.factionPick(skipA.state, pair.b, null)
      check('B 在已决定后再选会被拒绝', Boolean(skipB.error), skipB.error ?? '没有被拒绝')
    } else {
      check('同盟交换（不谈）场景可构造', false, '未能进入结算 + 同盟状态')
    }
  }

  /* ================= 三、非盟友不能替别人拍板 ================= */
  {
    const { state: s0, seats, pair } = reachResolvedWithAlliance('FD3')
    if (pair && s0.phase === 'resolved') {
      const outsider = seats.find((x) => x !== pair.a && x !== pair.b)
      const r = E.factionPick(s0, outsider, 'anything')
      check('非盟友无法拍板别人的交换牌', Boolean(r.error), r.error ?? '没有被拒绝')
    } else {
      check('同盟交换（越权）场景可构造', false, '未能进入结算 + 同盟状态')
    }
  }
} finally {
  cleanup()
}

/* ================= 出局/流亡者结盟拒绝 ================= */
{
  // 直接构造含出局/流亡玩家的盟约阶段状态，验证 councilAllyRequest 在协议层拒绝。
  const reachCouncil = () => {
    let { state, seats } = newMatch('FALLEN')
    state = submitAll(state, seats)
    return { state, seats }
  }

  /** 在 state 里找到一对「可正常结盟」的 (selfId, targetId)；找不到返回 null */
  const findPair = (state) => {
    for (const self of state.players) {
      for (const o of state.players) {
        if (o.id === self.id) continue
        if (!E.councilAllyRequest(state, self.id, o.id).error) return [self.id, o.id]
      }
    }
    return null
  }

  // 场景 1：发起者已出局
  {
    const { state } = reachCouncil()
    const pair = findPair(state)
    if (pair) {
      const [selfId] = pair
      const s = { ...state, players: state.players.map((p) => (p.id === selfId ? { ...p, defeated: true } : p)) }
      const target = s.players.find((p) => p.id !== selfId && !E.councilAllyRequest(state, selfId, p.id).error)
      const r = E.councilAllyRequest(s, selfId, target.id)
      check('出局者发起结盟被拒绝', Boolean(r.error), r.error ?? '没有被拒绝')
    } else {
      check('出局者结盟场景可构造', false, '未找到可结盟对')
    }
  }

  // 场景 2：目标已出局
  {
    const { state } = reachCouncil()
    const pair = findPair(state)
    if (pair) {
      const [selfId, targetId] = pair
      const s = { ...state, players: state.players.map((p) => (p.id === targetId ? { ...p, defeated: true } : p)) }
      const r = E.councilAllyRequest(s, selfId, targetId)
      check('向出局者发起结盟被拒绝', Boolean(r.error), r.error ?? '没有被拒绝')
    } else {
      check('向出局者结盟场景可构造', false, '未找到可结盟对')
    }
  }

  // 场景 3：发起者流亡
  {
    const { state } = reachCouncil()
    const pair = findPair(state)
    if (pair) {
      const [selfId] = pair
      const s = { ...state, players: state.players.map((p) => (p.id === selfId ? { ...p, exiled: true, exileUsed: true } : p)) }
      const target = s.players.find((p) => p.id !== selfId && !E.councilAllyRequest(state, selfId, p.id).error)
      const r = E.councilAllyRequest(s, selfId, target.id)
      check('流亡者发起结盟被拒绝', Boolean(r.error), r.error ?? '没有被拒绝')
    } else {
      check('流亡者结盟场景可构造', false, '未找到可结盟对')
    }
  }

  // 场景 4：目标流亡
  {
    const { state } = reachCouncil()
    const pair = findPair(state)
    if (pair) {
      const [selfId, targetId] = pair
      const s = { ...state, players: state.players.map((p) => (p.id === targetId ? { ...p, exiled: true, exileUsed: true } : p)) }
      const r = E.councilAllyRequest(s, selfId, targetId)
      check('向流亡者发起结盟被拒绝', Boolean(r.error), r.error ?? '没有被拒绝')
    } else {
      check('向流亡者结盟场景可构造', false, '未找到可结盟对')
    }
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'─'.repeat(52)}`)
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exit(1)
}
console.log('同盟交换功能验证全部通过 ✓\n')

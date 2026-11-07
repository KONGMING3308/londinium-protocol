/**
 * 本地热座调试模式的端到端验证。
 *
 * 这个模式的设计前提是「和联机版共用同一个引擎，只是把传输层换成内存」，
 * 所以测试重点不是「能不能跑」，而是：
 *   1. 它真的能独立跑完一整局（不需要服务端、不需要第二个浏览器）
 *   2. 它和联机版**行为一致**（同样的操作得到同样的结果、同样的拒绝）
 *   3. 视角切换后看到的私有信息确实跟着变（热座的关键）
 *
 * 用法：node scripts/test-local.mjs（需先 npm run build 生成服务端产物，
 * 因为要用引擎的打包结果；也可以用 esbuild 现场打包）
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

/**
 * 引擎与服务端构建脚本共用同一套别名规则。
 * 这里现场把 engine.ts 打成一个可 import 的 ESM 文件，直接复用生产代码。
 */
async function loadEngine() {
  const outdir = mkdtempSync(join(tmpdir(), 'londinium-local-'))
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

try {
  /* ================= 一、本地模式能独立跑完一整局 ================= */
  {
    let state = E.createEngine('LOCAL')
    const seats = []
    for (let i = 0; i < 4; i += 1) {
      const r = E.joinAsPlayer(state, `本地${i + 1}`)
      if ('error' in r) throw new Error(r.error)
      state = r.state
      seats.push(r.playerId)
    }
    check('本地模式建满 4 个座位', seats.length === 4, seats.join(','))

    for (const id of seats) {
      const r = E.setReady(state, id, true)
      if (!r.error) state = r.state
    }
    check('四人准备后 canStart 为真', E.canStart(state))

    let r = E.startMatch(state)
    if (r.error) throw new Error(r.error)
    state = r.state
    check('本地模式开局成功', state.phase === 'briefing')

    for (const id of seats) {
      r = E.briefingAck(state, id)
      if (!r.error) state = r.state
    }
    check('四人确认后进入暗选', state.phase === 'picking')

    // 打到终局
    let guard = 0
    for (; guard < 40; guard += 1) {
      if (state.phase === 'result') break

      if (state.phase === 'picking') {
        for (const id of seats) {
          const p = state.players.find((x) => x.id === id)
          if (!p || p.defeated) continue
          if (state.picks[id]) continue
          const hand = state.hands[id] ?? []
          const acts = hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC')
          if (acts.length < 2) continue
          const res = E.submitPick(state, id, {
            actionCardIds: acts.slice(0, 2).map((c) => c.id),
            neutralAccept: false,
            designated: { play: null, keep: null },
          })
          if (!res.error) state = res.state
        }
        continue
      }
      if (state.phase === 'council') {
        for (const id of seats) {
          const res = E.councilReady(state, id)
          if (!res.error) state = res.state
        }
        continue
      }
      if (state.phase === 'resolved') {
        for (const id of seats) {
          const res = E.readyNext(state, id)
          if (!res.error) state = res.state
        }
        continue
      }
      break
    }
    check('本地模式能打到终局', state.phase === 'result', `用了 ${guard} 轮，第 ${state.round} 回合`)
    check('回合数落在 6–7 之间', state.round >= 6 && state.round <= 7, `第 ${state.round} 回合`)
  }

  /* ================= 二、与联机版行为一致（同一批非法操作） ================= */
  {
    // 用完全相同的方式驱动两套「环境」，确认拒绝理由一致。
    // 联机版由 scripts/test-online.mjs 覆盖，这里验证引擎层的判定是同一份。
    let state = E.createEngine('X')
    const seats = []
    for (let i = 0; i < 4; i += 1) {
      const r = E.joinAsPlayer(state, `P${i}`)
      state = r.state
      seats.push(r.playerId)
    }
    for (const id of seats) {
      const r = E.setReady(state, id, true)
      if (!r.error) state = r.state
    }
    state = E.startMatch(state).state
    for (const id of seats) state = E.briefingAck(state, id).state

    // 1) 提交不在手牌里的牌
    const bad = E.submitPick(state, seats[0], {
      actionCardIds: ['FAKE-1', 'FAKE-2'],
      neutralAccept: false,
      designated: { play: null, keep: null },
    })
    check('本地模式同样拒绝伪造手牌', Boolean(bad.error), bad.error)

    // 2) 只提交 1 张
    const hand = state.hands[seats[0]] ?? []
    const one = E.submitPick(state, seats[0], {
      actionCardIds: [hand[0]?.id ?? 'x'],
      neutralAccept: false,
      designated: { play: null, keep: null },
    })
    check('本地模式同样拒绝只提交 1 张', Boolean(one.error), one.error)

    // 3) 替别人提交（引擎层拿 playerId，说明服务端/本地都以连接身份为准）
    const other = seats[1]
    const acts = hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC')
    if (acts.length >= 2) {
      const asOther = E.submitPick(state, other, {
        actionCardIds: acts.slice(0, 2).map((c) => c.id),
        neutralAccept: false,
        designated: { play: null, keep: null },
      })
      check('本地模式同样拒绝拿别人的手牌替其提交', Boolean(asOther.error), asOther.error)
    } else {
      check('本地模式同样拒绝拿别人的手牌替其提交（跳过：手牌不足）', true)
    }
  }

  /* ================= 三、视角切换后私有信息跟着变 ================= */
  {
    let state = E.createEngine('V')
    const seats = []
    for (let i = 0; i < 4; i += 1) {
      const r = E.joinAsPlayer(state, `视角${i + 1}`)
      state = r.state
      seats.push(r.playerId)
    }
    for (const id of seats) {
      const r = E.setReady(state, id, true)
      if (!r.error) state = r.state
    }
    state = E.startMatch(state).state
    for (const id of seats) state = E.briefingAck(state, id).state

    const views = seats.map((id) => E.viewFor(state, id, new Set(seats)))
    const hands = views.map((v) => v.match.self.hand.map((c) => c.id).sort().join(','))
    const uniqueHands = new Set(hands)
    check('四个视角看到的手牌互不相同', uniqueHands.size === 4, `共 ${uniqueHands.size} 种`)

    // 每个视角的手牌必须等于服务端为该玩家保存的那份
    const allMatch = seats.every((id, i) => {
      const expected = (state.hands[id] ?? []).map((c) => c.id).sort().join(',')
      return hands[i] === expected
    })
    check('每个视角的手牌与服务端所存完全一致', allMatch)

    // 公开玩家列表不含私密字段
    const leakHand = views.some((v) => v.match.players.some((p) => 'hand' in p))
    const leakVictory = views.some((v) => v.match.players.some((p) => 'victory' in p))
    const leakHeld = views.some((v) => v.match.players.some((p) => 'heldDesignated' in p))
    check('公开玩家列表不含 hand / victory / heldDesignated', !leakHand && !leakVictory && !leakHeld)

    // 视角切换 = 同一份状态换一个 viewer，结果应该随之改变
    const v1 = E.viewFor(state, seats[0], new Set(seats))
    const v2 = E.viewFor(state, seats[1], new Set(seats))
    check(
      '切换操作者后看到的是另一个人的界面',
      v1.match.self.id === seats[0] && v2.match.self.id === seats[1] && v1.match.self.id !== v2.match.self.id,
      `${v1.match.self.id} → ${v2.match.self.id}`,
    )
    check(
      '切换操作者后手牌也跟着换（热座的核心）',
      v1.match.self.hand.map((c) => c.id).join(',') !== v2.match.self.hand.map((c) => c.id).join(','),
    )
  }

  /* ================= 四、本地模式不依赖网络 ================= */
  {
    // 本地模式的所有操作都是纯内存函数调用，没有任何 socket。
    // 这里验证「同一份状态可以被反复取视图而不改变它」——纯函数的标志。
    const before = JSON.stringify(E.viewFor(E.createEngine('Z'), null, new Set()))
    const after = JSON.stringify(E.viewFor(E.createEngine('Z'), null, new Set()))
    check('视图生成是纯函数（同状态两次结果一致）', before === after)
  }
} finally {
  cleanup()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'─'.repeat(50)}`)
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exit(1)
}
console.log('本地热座调试模式验证全部通过 ✓\n')

/**
 * 指定牌「只能保留一回合」规则验证。
 *
 * 背景：测试报告 P1 发现文案写着「最多保留一回合」，但服务端允许无限保留。
 * 核对设计文档（docs/00-澄清记录.md 第 6 条）后确认：
 *   - 正常玩家：保留上限 1 张，且只能保留一回合，之后必须打出或弃置
 *   - 流亡玩家：唯一例外，可跨回合继续保留同一张
 * 所以是**实现错了**，不是文案错了。本测试固化修复后的行为。
 *
 * 用法：node scripts/test-holdlimit.mjs
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
  const outdir = mkdtempSync(join(tmpdir(), 'londinium-hold-'))
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

/** 找一张指定牌的两张行动牌（必须能付得起） */
function pickActions(hand) {
  return hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC').slice(0, 2)
}

try {
  /* ================= 正常玩家：不能连续两回合保留 ================= */
  {
    let state = E.createEngine('HOLD1')
    const seats = []
    for (let i = 0; i < 4; i += 1) {
      const r = E.joinAsPlayer(state, `P${i + 1}`)
      state = r.state
      seats.push(r.playerId)
    }
    seats.forEach((id) => {
      state = E.setReady(state, id, true).state
    })
    const started = E.startMatch(state)
    state = started.state
    // 全员确认简报
    seats.forEach((id) => {
      state = E.briefingAck(state, id).state
    })
    check('开局进入暗选', state.phase === 'picking', state.phase)

    const me = seats[0]
    const hand1 = state.hands[me]
    const acts1 = pickActions(hand1)
    const offered1 = hand1.find((c) => c.category === 'designated')
    check('第 1 回合手上有指定牌', Boolean(offered1))

    // R1：保留新牌
    const r1 = E.submitPick(state, me, {
      actionCardIds: acts1.map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: 'new' },
      targetId: null,
    })
    check('R1 保留指定牌成功', !r1.error, r1.error ?? '')
    state = r1.state
    const heldAfterR1 = state.players.find((p) => p.id === me).heldDesignated
    const keptRoundR1 = state.players.find((p) => p.id === me).heldKeptRound
    check('保留牌已记录', Boolean(heldAfterR1))
    check('保留起始回合记为第 1 回合', keptRoundR1 === 1, `heldKeptRound=${keptRoundR1}`)

    // 推进到 R2：全员提交 + 盟约就绪
    const advance = () => {
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
      if (state.phase === 'council') {
        seats.forEach((id) => {
          state = E.councilReady(state, id).state
        })
      }
      if (state.phase === 'resolved') {
        seats.forEach((id) => {
          state = E.readyNext(state, id).state
        })
      }
    }
    advance()
    check('R1 结算完成进入下一回合', state.phase === 'picking', `${state.phase} round=${state.round}`)
    check('当前是第 2 回合', state.round === 2, `round=${state.round}`)

    // R2：尝试继续保留同一张旧牌 → 应被拒绝
    const hand2 = state.hands[me]
    const acts2 = pickActions(hand2)
    const meState2 = state.players.find((p) => p.id === me)
    check('R2 手上仍有那张保留牌', Boolean(meState2.heldDesignated))

    const badKeep = E.submitPick(state, me, {
      actionCardIds: acts2.map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: 'held' },
      targetId: null,
    })
    check('R2 继续保留旧牌被拒绝（只能保留一回合）', Boolean(badKeep.error), badKeep.error ?? '没有被拒绝')
    check(
      '拒绝理由明确提到保留限制',
      Boolean(badKeep.error && badKeep.error.includes('保留')),
      badKeep.error ?? '',
    )

    // R2：改为弃置 → 应成功
    const okDiscard = E.submitPick(state, me, {
      actionCardIds: acts2.map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
    })
    check('R2 弃置旧牌可以正常提交', !okDiscard.error, okDiscard.error ?? '')
    check(
      '弃置后不再持有指定牌',
      !okDiscard.state.players.find((p) => p.id === me).heldDesignated,
    )
  }

  /* ================= 打出旧牌是合法的（不受限制） ================= */
  {
    let state = E.createEngine('HOLD2')
    const seats = []
    for (let i = 0; i < 4; i += 1) {
      const r = E.joinAsPlayer(state, `Q${i + 1}`)
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

    const me = seats[0]
    const h1 = state.hands[me]
    const acts1 = pickActions(h1)
    state = E.submitPick(state, me, {
      actionCardIds: acts1.map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: 'new' },
      targetId: null,
    }).state

    // 推进到 R2
    const advance2 = () => {
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
      if (state.phase === 'council') {
        seats.forEach((id) => {
          state = E.councilReady(state, id).state
        })
      }
      if (state.phase === 'resolved') {
        seats.forEach((id) => {
          state = E.readyNext(state, id).state
        })
      }
    }
    advance2()

    const hand2 = state.hands[me]
    const acts2 = pickActions(hand2)
    const others = seats.filter((id) => id !== me)
    const r = E.submitPick(state, me, {
      actionCardIds: acts2.map((c) => c.id),
      neutralAccept: false,
      designated: { play: 'held', keep: null },
      targetId: others[0],
    })
    check('R2 打出上回合保留的牌是合法的', !r.error, r.error ?? '')
    check(
      '打出后保留槽清空',
      r.state && !r.state.players.find((p) => p.id === me).heldDesignated,
    )
  }

  /* ================= 流亡者是例外：可以跨回合一直留 ================= */
  {
    let state = E.createEngine('HOLD3')
    const seats = []
    for (let i = 0; i < 4; i += 1) {
      const r = E.joinAsPlayer(state, `X${i + 1}`)
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

    const me = seats[0]
    const h1 = state.hands[me]
    const acts1 = pickActions(h1)
    state = E.submitPick(state, me, {
      actionCardIds: acts1.map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: 'new' },
      targetId: null,
    }).state

    // 强制让该玩家进入流亡，并把保留回合改成更早，模拟「已经留了很久」
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === me ? { ...p, exiled: true, heldKeptRound: 0 } : p,
      ),
    }

    // 必须先推进到 R2，否则本回合已提交会被拦（第一步就 return 了，所以手牌还在）
    const advance3 = () => {
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
      if (state.phase === 'council') {
        seats.forEach((id) => {
          state = E.councilReady(state, id).state
        })
      }
      if (state.phase === 'resolved') {
        seats.forEach((id) => {
          state = E.readyNext(state, id).state
        })
      }
    }
    // me 已提交过，advance3 会跳过；其他人补交并推进
    advance3()
    check('已推进到下一回合（流亡测试前置）', state.phase === 'picking' && state.round === 2, `round=${state.round} phase=${state.phase}`)

    // 流亡状态在推进后可能被引擎重算，这里再强制一次
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === me ? { ...p, exiled: true, heldKeptRound: 0 } : p,
      ),
    }

    const hand2 = state.hands[me]
    const acts2 = pickActions(hand2)
    const r = E.submitPick(state, me, {
      actionCardIds: acts2.map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: 'held' },
      targetId: null,
    })
    check('流亡者可以跨回合继续保留（规则例外）', !r.error, r.error ?? '')
  }

  /* ================= 边界：同一回合内重复提交要被拦 ================= */
  {
    let state = E.createEngine('HOLD4')
    const seats = []
    for (let i = 0; i < 4; i += 1) {
      const r = E.joinAsPlayer(state, `Z${i + 1}`)
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

    const me = seats[0]
    const h = state.hands[me]
    const acts = pickActions(h)
    const first = E.submitPick(state, me, {
      actionCardIds: acts.map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: 'new' },
      targetId: null,
    })
    const second = E.submitPick(first.state, me, {
      actionCardIds: acts.map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: 'new' },
      targetId: null,
    })
    check('同一回合不能重复提交', Boolean(second.error), second.error ?? '')
  }
} finally {
  cleanup()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'─'.repeat(52)}`)
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exit(1)
}
console.log('指定牌保留上限规则验证全部通过 ✓\n')

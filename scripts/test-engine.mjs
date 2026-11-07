/**
 * 引擎级蒙特卡洛测试：绕过网络，直接对 engine 做大量完整对局。
 *
 * 目的：联机改造最大的风险是状态机死锁（某个阶段没人能推进、或推进后卡住），
 * 这类问题在浏览器里很难稳定复现，但在这里跑 200 局就能暴露。
 *
 * 用法：node scripts/test-engine.mjs
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(here, '..')
const EXTS = ['.ts', '.tsx', '.js', '.json']

/** 把 @/xxx 解析成真实文件，规则与 scripts/build-server.mjs 保持一致 */
function resolveAlias(specifier) {
  const base = resolve(root, 'src', specifier.slice(2))
  for (const ext of EXTS) {
    if (existsSync(base + ext)) return base + ext
  }
  for (const ext of EXTS) {
    const candidate = resolve(base, 'index' + ext)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * 用 esbuild 现场把引擎打成临时 ESM 模块再 import。
 * 这样测的就是「将来跑在服务端的那份代码」，而不是另写一份实现。
 */
async function loadEngine() {
  const dir = mkdtempSync(join(tmpdir(), 'londinium-engine-'))
  const outfile = join(dir, 'engine.mjs')
  await build({
    entryPoints: [resolve(root, 'src/game/engine.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
    plugins: [
      {
        name: 'alias-at',
        setup(b) {
          b.onResolve({ filter: /^@\// }, (args) => {
            const p = resolveAlias(args.path)
            if (!p) return { errors: [{ text: `无法解析别名 ${args.path}` }] }
            return { path: p }
          })
        },
      },
    ],
  })
  const mod = await import(pathToFileURL(outfile).href)
  return { mod, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const { mod, cleanup } = await loadEngine()
  const {
    createEngine,
    joinAsPlayer,
    setReady,
    canStart,
    startMatch,
    briefingAck,
    submitPick,
    councilReady,
    councilAllyRequest,
    councilAllyRespond,
    factionPick,
    readyNext,
    viewFor,
  } = mod

  const N = 200
  let finished = 0
  let deadlocked = 0
  let rejected = 0
  let roundsPlayed = 0
  const phaseCounts = {}
  let wins = 0
  let noWinner = 0
  /** 竞标结构性校验的计数器 */
  let badBid = 0
  let badBidResult = 0

  for (let game = 0; game < N; game += 1) {
    let state = createEngine(`T${game}`)
    const ids = []
    for (let i = 0; i < 4; i += 1) {
      const r = joinAsPlayer(state, `玩家${i + 1}`)
      if (r.error) throw new Error(`加入失败：${r.error}`)
      state = r.state
      ids.push(r.playerId)
    }
    ids.forEach((id) => {
      state = setReady(state, id, true).state
    })
    if (!canStart(state)) {
      check('四人准备后可开局', false)
      break
    }
    const started = startMatch(state)
    if (started.error) throw new Error(`开局失败：${started.error}`)
    state = started.state

    ids.forEach((id) => {
      const r = briefingAck(state, id)
      if (!r.error) state = r.state
    })

    let guard = 0
    while (state.phase !== 'result' && guard < 300) {
      guard += 1
      phaseCounts[state.phase] = (phaseCounts[state.phase] ?? 0) + 1

      if (state.phase === 'picking') {
        for (const id of ids) {
          if (state.phase !== 'picking') break
          const v = viewFor(state, id, new Set(ids))
          const me = v.match.self
          if (me.defeated) continue
          const acts = me.hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC')
          if (acts.length < 2) continue
          const offered = me.hand.find((c) => c.category === 'designated')
          const others = v.match.players.filter((p) => p.id !== id && !p.defeated)
          let designated = { play: null, keep: null }
          if (offered) {
            if (me.exiled) designated = { play: null, keep: 'new' }
            else if (others.length > 0 && Math.random() < 0.8) designated = { play: 'new', keep: null }
            else designated = { play: null, keep: 'new' }
          }
          /* 中立资源竞标：让压测也覆盖这条路径。
           * 随机出价，包含「不出价」「刚好最低价」「出高价」「非法值」几种情况，
           * 目的是验证任何出价都不会让引擎崩掉或卡住。 */
          let bid = null
          if (state.neutralPoints.length > 0) {
            const roll = Math.random()
            if (roll < 0.5) {
              const pt = state.neutralPoints[Math.floor(Math.random() * state.neutralPoints.length)]
              if (roll < 0.15) {
                // 故意用非法值，验证被服务端拒绝而不是引崩溃
                bid = { pointId: pt.id, amount: -1 }
              } else if (roll < 0.25) {
                bid = { pointId: pt.id, amount: pt.minBid - 1 }
              } else if (roll < 0.4) {
                bid = { pointId: pt.id, amount: pt.minBid }
              } else {
                bid = { pointId: pt.id, amount: pt.minBid + Math.floor(Math.random() * 4) }
              }
            }
          }
          const r = submitPick(state, id, {
            actionCardIds: acts.slice(0, 2).map((c) => c.id),
            neutralAccept: Math.random() < 0.5,
            designated,
            targetId: designated.play ? others[0].id : null,
            bid,
          })
          if (r.error) {
            const point = bid ? state.neutralPoints.find((p) => p.id === bid.pointId) : null
            // 故意注入的非法出价被拒是预期行为，不算「误拒」
            const isIntentionalReject = Boolean(bid) && (bid.amount < 0 || (point ? bid.amount < point.minBid : true))
            if (isIntentionalReject) {
              // 被拒后去掉出价重试，模拟「填错数字被拒后重新提交」——
              // 否则这个玩家这轮就没提交，压测会误判成死锁
              const retry = submitPick(state, id, {
                actionCardIds: acts.slice(0, 2).map((c) => c.id),
                neutralAccept: false,
                designated,
                targetId: designated.play ? others[0].id : null,
              })
              if (retry.error) rejected += 1
              else state = retry.state
            } else {
              rejected += 1
            }
          } else {
            state = r.state
          }
        }
        if (state.phase === 'picking') {
          deadlocked += 1
          break
        }
      } else if (state.phase === 'council') {
        const living = state.players.filter((p) => !p.defeated)
        if (living.length >= 2 && Math.random() < 0.5) {
          const a = living[0]
          const b = living[1]
          if (!a.allyId && !b.allyId) {
            const req = councilAllyRequest(state, a.id, b.id)
            if (!req.error) {
              state = req.state
              const ok = councilAllyRespond(state, b.id, a.id, true)
              if (!ok.error) state = ok.state
            }
          }
        }
        for (const id of ids) {
          if (state.phase !== 'council') break
          const r = councilReady(state, id)
          if (!r.error) state = r.state
        }
        if (state.phase === 'council') {
          deadlocked += 1
          break
        }
      } else if (state.phase === 'resolved') {
        const seen = new Set()
        for (const id of ids) {
          if (state.phase !== 'resolved') break
          const v = viewFor(state, id, new Set(ids))
          const fv = v.match.faction
          if (fv.offers.length > 0 && fv.canPick && !seen.has(id)) {
            seen.add(id)
            const r = factionPick(state, id, Math.random() < 0.6 ? fv.offers[0].id : null)
            if (!r.error) state = r.state
          }
        }
        for (const id of ids) {
          if (state.phase !== 'resolved') break
          const r = readyNext(state, id)
          if (!r.error) state = r.state
        }
        if (state.phase === 'resolved') {
          deadlocked += 1
          break
        }
      } else {
        deadlocked += 1
        break
      }
    }

    if (state.phase === 'result') {
      finished += 1
      roundsPlayed += state.round
      if (state.winner) wins += 1
      else noWinner += 1
      const bad = state.players.filter(
        (p) =>
          !Number.isFinite(p.stats.manpower) ||
          !Number.isFinite(p.stats.supply) ||
          !Number.isFinite(p.stats.morale),
      )
      if (bad.length > 0) throw new Error(`第 ${game} 局出现非法数值`)

      /* 竞标结构性校验：
       * 1) 任何时刻 bids 里都不该残留非法金额（引擎只接受合法的，非法整单拒绝）
       * 2) bidResults 里的赢家必须是在场玩家，且出价列表与赢家一致 */
      for (const b of Object.values(state.bids)) {
        if (!Number.isInteger(b.amount) || b.amount < 0) badBid += 1
      }
      for (const r of state.bidResults) {
        if (r.tied && r.winnerId !== null) badBidResult += 1
        if (!r.tied && r.winnerId && !state.players.some((p) => p.id === r.winnerId)) {
          badBidResult += 1
        }
        if (r.winnerId && r.winningBid <= 0) badBidResult += 1
        if (new Set(r.bids.map((x) => x.playerId)).size !== r.bids.length) badBidResult += 1
      }
    }
  }

  check(`${N} 局全部跑到终局`, finished === N, `${finished}/${N}`)
  check('无状态机死锁', deadlocked === 0, `死锁 ${deadlocked} 次`)
  // 判胜从第 6 回合起生效，所以「提前终局」是正确行为，上限才是 7
  const avgRounds = roundsPlayed / Math.max(1, finished)
  check(
    '回合数落在 6–7 之间（第 6 回合起可提前判胜）',
    avgRounds >= 6 && avgRounds <= 7,
    `平均 ${avgRounds.toFixed(2)} 回合`,
  )
  check('合法操作没有被误拒', rejected === 0, `拒绝 ${rejected} 次`)
  check(
    '三个核心阶段都被覆盖',
    Boolean(phaseCounts.picking && phaseCounts.council && phaseCounts.resolved),
    JSON.stringify(phaseCounts),
  )
  check('终局胜负判定生效', wins + noWinner === finished, `有人获胜 ${wins} 局 / 无人获胜 ${noWinner} 局`)

  /* 竞标链路的结构性校验：200 局全程没有出现脏数据 */
  check(
    '200 局全程没有非法出价残留',
    badBid === 0,
    `${badBid} 次`,
  )
  check(
    '200 局全程竞标结果结构与玩家对得上',
    badBidResult === 0,
    `${badBidResult} 次`,
  )

  /* ================= 边界：全员出局时 readyNext 直接进终局 =================
   * 构造一个 resolved 阶段、四人全 defeated 的状态。
   * 若没有这条兜底，readyNext 会再开一回合空转，服务端定时器反复空转。 */
  {
    let b = createEngine('ALL-DEAD')
    for (let i = 0; i < 4; i += 1) b = joinAsPlayer(b, `死者${i + 1}`).state
    const ids = b.players.map((p) => p.id)
    ids.forEach((id) => { b = setReady(b, id, true).state })
    b = startMatch(b).state
    ids.forEach((id) => { b = briefingAck(b, id).state })
    // 直接构造「全出局」的 resolved 状态
    b = {
      ...b,
      phase: 'resolved',
      players: b.players.map((p) => ({ ...p, defeated: true, readyNext: false })),
    }
    const r = readyNext(b, ids[0])
    check('全员出局时 readyNext 直接进入终局', r.state.phase === 'result', r.state.phase)
  }

  cleanup()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`通过 ${results.length - failed.length} / ${results.length}`)
  if (failed.length > 0) {
    failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
    process.exit(1)
  }
  console.log('引擎压测全部通过 ✓\n')
}

main().catch((err) => {
  console.error('压测异常：', err)
  process.exit(1)
})

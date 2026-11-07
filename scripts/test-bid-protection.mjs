/**
 * B7 竞标扣费减半（低补给保护）的专项回归测试。
 *
 * 背景：审计报告 B7 指出「竞标扣费与抢补给牌叠加挤压低补给阵营」——
 * 实录中 SSC 第一回合就因为「出价扣费 2 + 被夺补给」直接崩溃流亡。
 * 修复方式是：**扣费前**补给不足 5 的玩家，本次竞标总扣费减半（向下取整，至少 1）。
 *
 * 这条保护很容易在后续调参里被无意改坏（比如手滑把 `< 5` 写成 `<= 5`，
 * 或把 `Math.max(1, ...)` 去掉导致 1 费出价变成 0 费），所以用边界值把它钉死。
 *
 * 用法：node scripts/test-bid-protection.mjs
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

const outdir = mkdtempSync(join(tmpdir(), 'londinium-bidprot-'))

async function buildOne(rel, name) {
  const outfile = join(outdir, name)
  await build({
    entryPoints: [resolve(root, rel)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    plugins: [createAliasPlugin(root)],
  })
  return pathToFileURL(outfile).href
}

/** 造一个最小可用的 PlayerState（只填 resolveBids 会读到的字段） */
function mkPlayer(id, supply, extra = {}) {
  return {
    id,
    name: id,
    factionId: 'SSC',
    stats: { manpower: 10, supply, morale: 10 },
    warProgress: 0,
    heldDesignated: null,
    heldKeptRound: null,
    exileUsed: false,
    exiled: false,
    defeated: false,
    allyId: null,
    betrayed: false,
    betrayedThisRound: false,
    nullifiedTags: [],
    keyTags: [],
    ...extra,
  }
}

/** 奖励只用士气，避免和补给扣费混在一起看不清 */
const POINT = { id: 'X', name: '测试点', reward: { morale: 1 }, flavor: '', minBid: 1 }

function supplyAfter(players, id) {
  return players.find((p) => p.id === id).stats.supply
}

try {
  const bidUrl = await buildOne('src/utils/game/bid.ts', 'bid.mjs')
  const { resolveBids } = await import(bidUrl)

  /* ============ 一、低于 5 补给：扣费减半 ============ */

  // 补给 3、出价 4 → floor(4/2) = 2
  {
    const r = resolveBids([mkPlayer('p1', 3)], [POINT], { p1: { pointId: 'X', amount: 4 } }, 1)
    check('B7：补给 3 出价 4 → 实扣 2', supplyAfter(r.players, 'p1') === 1, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }

  // 补给 4、出价 3 → floor(3/2) = 1
  {
    const r = resolveBids([mkPlayer('p1', 4)], [POINT], { p1: { pointId: 'X', amount: 3 } }, 1)
    check('B7：补给 4 出价 3 → 实扣 1', supplyAfter(r.players, 'p1') === 3, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }

  // 补给 1、出价 2（透支）→ floor(2/2)=1，max(1) 兜底
  {
    const r = resolveBids([mkPlayer('p1', 1)], [POINT], { p1: { pointId: 'X', amount: 2 } }, 1)
    check('B7：透支场景 补给 1 出价 2 → 实扣 1', supplyAfter(r.players, 'p1') === 0, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }

  // 关键兜底：出价 1 在减免后必须仍是 1，不能被抹成 0（否则等于免费抢点）
  {
    const r = resolveBids([mkPlayer('p1', 3)], [POINT], { p1: { pointId: 'X', amount: 1 } }, 1)
    check('B7：补给 3 出价 1 → 仍扣 1（不被抹成 0）', supplyAfter(r.players, 'p1') === 2, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }

  // 补给 0 出价 1 → 扣 1，允许压到负数（崩溃由结算层负责）
  {
    const r = resolveBids([mkPlayer('p1', 0)], [POINT], { p1: { pointId: 'X', amount: 1 } }, 1)
    check('B7：补给 0 出价 1 → 扣 1 变 -1（不拦截，交由崩溃判定）', supplyAfter(r.players, 'p1') === -1, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }

  /* ============ 二、边界：补给恰好 5 不减免 ============ */

  {
    const r = resolveBids([mkPlayer('p1', 5)], [POINT], { p1: { pointId: 'X', amount: 4 } }, 1)
    check('B7 边界：补给 5 出价 4 → 全额扣 4（不足 5 才减免）', supplyAfter(r.players, 'p1') === 1, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }
  {
    const r = resolveBids([mkPlayer('p1', 6)], [POINT], { p1: { pointId: 'X', amount: 5 } }, 1)
    check('B7 边界：补给 6 出价 5 → 全额扣 5', supplyAfter(r.players, 'p1') === 1, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }

  /* ============ 三、输家与流拍同样享受减免（都要扣钱） ============ */

  {
    // 低补给者出价 2 输给高价者 → 只扣 1
    const players = [mkPlayer('poor', 3), mkPlayer('rich', 12)]
    const r = resolveBids(players, [POINT], {
      poor: { pointId: 'X', amount: 2 },
      rich: { pointId: 'X', amount: 6 },
    }, 1)
    check('B7：低补给输家出价 2 → 实扣 1', supplyAfter(r.players, 'poor') === 2, `剩余 ${supplyAfter(r.players, 'poor')}`)
    check('B7：高补给赢家出价 6 → 全额扣 6', supplyAfter(r.players, 'rich') === 6, `剩余 ${supplyAfter(r.players, 'rich')}`)
    const poor = r.players.find((p) => p.id === 'poor')
    check('B7：输家拿不到奖励（士气不变）', poor.stats.morale === 10, `士气 ${poor.stats.morale}`)
  }

  {
    // 并列最高 → 流拍，但低补给方仍按减免扣费
    const players = [mkPlayer('a', 1), mkPlayer('b', 1)]
    const r = resolveBids(players, [POINT], {
      a: { pointId: 'X', amount: 4 },
      b: { pointId: 'X', amount: 4 },
    }, 1)
    const bidResult = r.results[0]
    check('B7：并列流拍仍标记 tied', bidResult.tied === true)
    check('B7：流拍时低补给方实扣 2（4 → floor(4/2)）', supplyAfter(r.players, 'a') === -1, `剩余 ${supplyAfter(r.players, 'a')}`)
    check('B7：流拍无人获得奖励', r.players.every((p) => p.stats.morale === 10))
  }

  /* ============ 四、不该扣的场景不能被减免逻辑带出副作用 ============ */

  {
    const r = resolveBids([mkPlayer('p1', 3)], [POINT], { p1: { pointId: null, amount: 0 } }, 1)
    check('B7：不参与争夺 → 不扣费', supplyAfter(r.players, 'p1') === 3, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }
  {
    const r = resolveBids([mkPlayer('p1', 3, { defeated: true })], [POINT], { p1: { pointId: 'X', amount: 4 } }, 1)
    check('B7：出局玩家的出价被忽略 → 不扣费', supplyAfter(r.players, 'p1') === 3, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }
  {
    // 出价低于 minBid 视为无效，不进扣费表
    const highPoint = { ...POINT, minBid: 3 }
    const r = resolveBids([mkPlayer('p1', 3)], [highPoint], { p1: { pointId: 'X', amount: 2 } }, 1)
    check('B7：低于 minBid 的出价不计入扣费', supplyAfter(r.players, 'p1') === 3, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }

  /* ============ 五、多人多点的累计扣费也走同一套减免 ============ */

  {
    const p2 = { ...POINT, id: 'Y', name: '测试点2' }
    const players = [mkPlayer('p1', 4)]
    const r = resolveBids(players, [POINT, p2], {
      p1: { pointId: 'X', amount: 2 },
    }, 1)
    void p2
    check('B7：单点出价 2、补给 4 → 实扣 1', supplyAfter(r.players, 'p1') === 3, `剩余 ${supplyAfter(r.players, 'p1')}`)
  }
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  rmSync(outdir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log('\n' + '─'.repeat(60))
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  console.log('失败项：')
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exitCode = 1
} else {
  console.log('B7 低补给竞标保护验证全部通过 ✓')
}

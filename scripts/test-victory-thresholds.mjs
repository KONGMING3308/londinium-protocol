/**
 * 胜负判定门槛的数值锁定测试（A1 / B1 / B2 / B3 / B4 / B6 / B9）。
 *
 * 为什么要有这个文件：v0.4.2 的审计报告指出「R6 提前判胜吞掉第 7 回合」（P0-A1），
 * 随后的调参把一批门槛改了数值（B1/B3/B4/B6），并列判胜也改成了次级比较（B2）。
 * 这些数字全靠 judgeVictory 里的字面量维持，**没有任何测试盯着它们**——
 * 一旦后续有人为了平衡再改一次，改动会静默生效，下一次审计又要重新发现一遍。
 *
 * 这里把每条门槛的「刚好达标」与「差一点」两侧都钉死，
 * 顺便把 A1 的「R6 = 基础门槛 + 2」规则也锁住。
 *
 * 用法：node scripts/test-victory-thresholds.mjs
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

const outdir = mkdtempSync(join(tmpdir(), 'londinium-victory-'))

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

/** 造一个最小 PlayerState */
function mk(id, factionId, stats, extra = {}) {
  return {
    id,
    name: id,
    factionId,
    stats: { manpower: 1, supply: 1, morale: 1, ...stats },
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

/** 陪衬：四个阵营里除被测者之外的三位，全部低数值、无标签、未倒下 */
function bystanders(excludeFaction, { fallen = 0 } = {}) {
  const others = ['SARK', 'VIC', 'TARA', 'REU', 'SSC'].filter((f) => f !== excludeFaction).slice(0, 3)
  return others.map((f, i) => mk(`bystander${i}`, f, { manpower: 1, supply: 1, morale: 1 }, {
    defeated: i < fallen,
  }))
}

try {
  const victoryUrl = await buildOne('src/utils/game/victory.ts', 'victory.mjs')
  const factionsUrl = await buildOne('src/mocks/factions.ts', 'factions.mjs')
  const sscUrl = await buildOne('src/mocks/cards/ssc.ts', 'ssc.mjs')
  const reuUrl = await buildOne('src/mocks/cards/reu.ts', 'reu.mjs')

  const { judgeVictory } = await import(victoryUrl)
  const { FACTION_MAP } = await import(factionsUrl)
  const { SSC_ACTIONS } = await import(sscUrl)
  const { REU_ACTIONS } = await import(reuUrl)

  const who = (r) => (r ? r.factionId : 'null')

  /* ============ 一、A1：R6 提前判胜门槛 = 基础门槛 + 2 ============ */

  // SARK（B1：基础士气门槛 10）
  {
    const sark = mk('p1', 'SARK', { morale: 10 }, { warProgress: 3 })
    check('A1/B1：SARK R7 士气 10 + 战争进度 3 → 胜', who(judgeVictory([sark], 7)) === 'SARK')
    check('A1/B1：SARK R7 士气 9 → 不胜', who(judgeVictory([mk('p1', 'SARK', { morale: 9 }, { warProgress: 3 })], 7)) === 'null')
    check('A1/B1：SARK R6 士气 12 → 胜（10+2）', who(judgeVictory([mk('p1', 'SARK', { morale: 12 }, { warProgress: 3 })], 6)) === 'SARK')
    check('A1/B1：SARK R6 士气 11 → 不胜（R6 门槛提高 2）', who(judgeVictory([mk('p1', 'SARK', { morale: 11 }, { warProgress: 3 })], 6)) === 'null')
    check('B1：SARK 战争进度 2 → 士气再高也不胜', who(judgeVictory([mk('p1', 'SARK', { morale: 30 }, { warProgress: 2 })], 7)) === 'null')
  }

  /* ============ 二、VIC：国剑 + 三线 12 + 别人倒下 ============ */

  {
    const base = [{ manpower: 12, supply: 12, morale: 12 }, { ...mk('p4', 'TARA', {}, { defeated: true }) }]
    const vic = mk('p1', 'VIC', { manpower: 12, supply: 12, morale: 12 }, { keyTags: ['国剑'] })
    check('VIC：国剑 + 三线 12 + 有人倒下 → R7 胜', who(judgeVictory([vic, ...base.slice(1)], 7)) === 'VIC')
    check('VIC：R6 三线 12 → 不胜（需 14）', who(judgeVictory([vic, mk('p4', 'TARA', {}, { defeated: true })], 6)) === 'null')
    const vic14 = mk('p1', 'VIC', { manpower: 14, supply: 14, morale: 14 }, { keyTags: ['国剑'] })
    check('VIC：R6 三线 14 → 胜（12+2）', who(judgeVictory([vic14, mk('p4', 'TARA', {}, { defeated: true })], 6)) === 'VIC')
    check('VIC：无人倒下 → 不胜', who(judgeVictory([vic, mk('p4', 'TARA', { morale: 1 })], 7)) === 'null')
    check('VIC：没有国剑 → 不胜', who(judgeVictory([mk('p1', 'VIC', { manpower: 12, supply: 12, morale: 12 }), mk('p4', 'TARA', {}, { defeated: true })], 7)) === 'null')
    const vicNullified = mk('p1', 'VIC', { manpower: 12, supply: 12, morale: 12 }, { keyTags: ['国剑'], nullifiedTags: ['国剑'] })
    check('VIC：国剑被击穿 → 不胜', who(judgeVictory([vicNullified, mk('p4', 'TARA', {}, { defeated: true })], 7)) === 'null')
  }

  /* ============ 三、TARA：有 VIC 时士气 13 / 无 VIC 时 15 且最高 ============ */

  {
    const vicAlive = mk('p2', 'VIC', { morale: 1 })
    const tara13 = mk('p1', 'TARA', { morale: 13 }, { keyTags: ['塔拉独立'] })
    const tara12 = mk('p1', 'TARA', { morale: 12 }, { keyTags: ['塔拉独立'] })
    check('B6：TARA（VIC 在场且未胜）士气 13 → 胜', who(judgeVictory([tara13, vicAlive], 7)) === 'TARA')
    check('B6：TARA 士气 12 → 不胜', who(judgeVictory([tara12, vicAlive], 7)) === 'null')
    check('B6：TARA R6 士气 15 → 胜（13+2）', who(judgeVictory([mk('p1', 'TARA', { morale: 15 }, { keyTags: ['塔拉独立'] }), vicAlive], 6)) === 'TARA')
    check('B6：TARA R6 士气 14 → 不胜', who(judgeVictory([mk('p1', 'TARA', { morale: 14 }, { keyTags: ['塔拉独立'] }), vicAlive], 6)) === 'null')

    // 场上没有 VIC：改判「士气 ≥15 且全场最高」
    const noVic = [mk('x', 'SARK', { morale: 5 })]
    check('TARA 无 VIC：士气 15 且最高 → 胜', who(judgeVictory([mk('p1', 'TARA', { morale: 15 }, { keyTags: ['塔拉独立'] }), ...noVic], 7)) === 'TARA')
    check('TARA 无 VIC：士气 14 → 不胜', who(judgeVictory([mk('p1', 'TARA', { morale: 14 }, { keyTags: ['塔拉独立'] }), ...noVic], 7)) === 'null')
    check('TARA 无 VIC：士气 15 但不是最高 → 不胜', who(judgeVictory([mk('p1', 'TARA', { morale: 15 }, { keyTags: ['塔拉独立'] }), mk('x', 'SARK', { morale: 16 })], 7)) === 'null')
    check('TARA：没有「塔拉独立」标签 → 不胜', who(judgeVictory([mk('p1', 'TARA', { morale: 30 }), vicAlive], 7)) === 'null')
  }

  /* ============ 四、B4：REU 双线 ≥10（不是三线） ============ */

  {
    const fallen = mk('p4', 'TARA', {}, { defeated: true })
    const reuTwoLine = mk('p1', 'REU', { manpower: 10, supply: 10, morale: 5 }, { keyTags: ['新纲领'] })
    check('B4：REU 双线 ≥10（士气 5）→ R7 胜', who(judgeVictory([reuTwoLine, fallen], 7)) === 'REU')
    const reuOneLine = mk('p1', 'REU', { manpower: 10, supply: 9, morale: 9 }, { keyTags: ['新纲领'] })
    check('B4：REU 仅一线 ≥10 → 不胜', who(judgeVictory([reuOneLine, fallen], 7)) === 'null')
    check('B4：REU 双线 12 → R6 胜（10+2）', who(judgeVictory([mk('p1', 'REU', { manpower: 12, supply: 12, morale: 1 }, { keyTags: ['新纲领'] }), fallen], 6)) === 'REU')
    check('B4：REU R6 双线 11 → 不胜', who(judgeVictory([mk('p1', 'REU', { manpower: 11, supply: 11, morale: 1 }, { keyTags: ['新纲领'] }), fallen], 6)) === 'null')
    check('B4：REU 无人倒下 → 不胜', who(judgeVictory([reuTwoLine, mk('p4', 'TARA', {})], 7)) === 'null')
  }

  /* ============ 五、B6：SSC 士气门槛 13 + 至少两名他人未倒下 ============ */

  {
    const twoAlive = [mk('x1', 'SARK', {}), mk('x2', 'VIC', {}), mk('x3', 'REU', {}, { defeated: true })]
    const ssc13 = mk('p1', 'SSC', { morale: 13 })
    check('B6：SSC 士气 13 + 两位他人未倒下 → R7 胜', who(judgeVictory([ssc13, ...twoAlive], 7)) === 'SSC')
    check('B6：SSC 士气 12 → 不胜', who(judgeVictory([mk('p1', 'SSC', { morale: 12 }), ...twoAlive], 7)) === 'null')
    check('B6：SSC R6 士气 15 → 胜（13+2）', who(judgeVictory([mk('p1', 'SSC', { morale: 15 }), ...twoAlive], 6)) === 'SSC')
    check('B6：SSC R6 士气 14 → 不胜', who(judgeVictory([mk('p1', 'SSC', { morale: 14 }), ...twoAlive], 6)) === 'null')
    const onlyOneAlive = [mk('x1', 'SARK', {}), mk('x2', 'VIC', {}, { defeated: true }), mk('x3', 'REU', {}, { defeated: true })]
    check('SSC：只有一位他人未倒下 → 不胜', who(judgeVictory([mk('p1', 'SSC', { morale: 40 }), ...onlyOneAlive], 7)) === 'null')
    check('SSC：自己曾流亡（exileUsed）→ 不胜', who(judgeVictory([mk('p1', 'SSC', { morale: 40 }, { exileUsed: true }), ...twoAlive], 7)) === 'null')
  }

  /* ============ 六、RI 守门：无人达成、士气 ≥13 且全场最高 ============ */

  {
    const others = [mk('x1', 'SARK', { morale: 5 }), mk('x2', 'VIC', { morale: 5 })]
    check('B6：RI 士气 13 且最高 → R7 胜', who(judgeVictory([mk('p1', 'RI', { morale: 13 }), ...others], 7)) === 'RI')
    check('B6：RI 士气 12 → 不胜', who(judgeVictory([mk('p1', 'RI', { morale: 12 }), ...others], 7)) === 'null')
    check('B6：RI R6 士气 15 → 胜（13+2）', who(judgeVictory([mk('p1', 'RI', { morale: 15 }), ...others], 6)) === 'RI')
    check('B6：RI R6 士气 14 → 不胜', who(judgeVictory([mk('p1', 'RI', { morale: 14 }), ...others], 6)) === 'null')
    check('RI：士气不是全场最高 → 不胜', who(judgeVictory([mk('p1', 'RI', { morale: 13 }), mk('x1', 'SARK', { morale: 20 })], 7)) === 'null')
    // F-07：RI 不参与并列排序，只有反制路线
    const sarkBroken = mk('x1', 'SARK', { morale: 1 }, { nullifiedTags: ['阿喃那'] })
    check('F-07：RI 打断阿喃那 → 直接胜（不看士气）', who(judgeVictory([mk('p1', 'RI', { morale: 1 }), sarkBroken], 7)) === 'RI')
  }

  /* ============ 七、B2：多方达标时的次级比较 ============ */

  {
    // SSC 士气 14 vs VIC 士气 13：旧 ORDER（VIC 在 SSC 前）会判 VIC，新规则判士气高的 SSC
    const sscHi = mk('p1', 'SSC', { manpower: 20, supply: 20, morale: 14 })
    const vicLo = mk('p2', 'VIC', { manpower: 13, supply: 13, morale: 13 }, { keyTags: ['国剑'] })
    const fallen = mk('p3', 'REU', {}, { defeated: true })
    // SSC 还需要「至少两名他人未倒下」，补一个安静的第 4 人（不达标）
    const quiet = mk('p4', 'SARK', { manpower: 2, supply: 2, morale: 2 })
    check('B2：SSC 士气 14 vs VIC 13 → SSC 胜（不按 ORDER）', who(judgeVictory([sscHi, vicLo, fallen, quiet], 7)) === 'SSC')

    // 士气相同 → 比三线之和：VIC 三线和 53 > SSC 39
    const sscTie = mk('p1', 'SSC', { manpower: 13, supply: 13, morale: 13 })
    const vicTie = mk('p2', 'VIC', { manpower: 20, supply: 20, morale: 13 }, { keyTags: ['国剑'] })
    check('B2：士气相同 → 三线和高者（VIC）胜', who(judgeVictory([sscTie, vicTie, fallen, quiet], 7)) === 'VIC')

    // 士气和三线都相同 → 退回 ORDER（VIC 在 SSC 前）
    const sscSame = mk('p1', 'SSC', { manpower: 13, supply: 13, morale: 13 })
    const vicSame = mk('p2', 'VIC', { manpower: 13, supply: 13, morale: 13 }, { keyTags: ['国剑'] })
    check('B2：士气与三线都相同 → 退回 ORDER（VIC）胜', who(judgeVictory([sscSame, vicSame, fallen, quiet], 7)) === 'VIC')
  }

  /* ============ 八、数据侧锁定：B3 / B9 ============ */

  {
    const ssc = FACTION_MAP.SSC
    check('B3：SSC 初始补给 = 5（原 3 过脆）', ssc.base.supply === 5, `supply=${ssc.base.supply}`)
    const sark = FACTION_MAP.SARK
    check('B3 对照：SARK 初始士气 = 6（未被误改）', sark.base.morale === 6, `morale=${sark.base.morale}`)

    const c11 = SSC_ACTIONS.find((c) => c.id === 'C-A11')
    check('B9：SSC C-A11 带 immunity 反制位', c11?.special === 'immunity', `special=${c11?.special}`)
    const e10 = REU_ACTIONS.find((c) => c.id === 'E-A10')
    check('B9：REU E-A10 带 cancelCounter 反制位', e10?.special === 'cancelCounter', `special=${e10?.special}`)
  }

  /* ============ 九、R6 之前不判胜 ============ */

  {
    const sark = mk('p1', 'SARK', { morale: 99 }, { warProgress: 9 })
    check('R1-R5 一律不判胜', [1, 2, 3, 4, 5].every((r) => judgeVictory([sark], r) === null))
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
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exitCode = 1
} else {
  console.log('胜负门槛与并列判胜规则验证全部通过 ✓')
}

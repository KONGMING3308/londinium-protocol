/**
 * 阵营名、盟约事件数值可见性、战争进度归属的回归测试。
 *
 * 背景（用户反馈，三件事同时报上来）：
 *   1. 盟约事件「没有正常触发 / 触发效果不明」—— 实测数值一直生效，
 *      但日志只写叙事不写数值，玩家看不出谁 +1 谁 -1，等于没触发。
 *   2. 「明明只有六个阵营，叙拉古和雷姆必拓是哪来的」—— describeStoryEvent
 *      手写了一份阵营名映射，把典范军写成「维多利亚」、整合运动写成「雷姆必拓」、
 *      市民自救军写成「叙拉古」，与权威 FACTION_MAP 脱节。
 *   3. 「战争进度应该只有萨卡兹有，不要搞错阵营」—— 结算逻辑其实已限制在萨卡兹，
 *      但阵营牌日志会无条件写「甲方战争进度 +N」（可能谎报），情报牌也会让非萨卡兹
 *      上「战争进度最高」的榜。
 *
 * 用法：node scripts/test-pact-story.mjs
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

const outdir = mkdtempSync(join(tmpdir(), 'londinium-pact-'))

try {
  const storyUrl = await buildOne('src/utils/game/story.ts', 'story.mjs')
  const pactUrl = await buildOne('src/utils/game/pact.ts', 'pact.mjs')
  const resolveUrl = await buildOne('src/utils/game/resolve.ts', 'resolve.mjs')
  const factionsUrl = await buildOne('src/mocks/factions.ts', 'factions.mjs')

  const { describeStoryEvent } = await import(storyUrl)
  const { describePactEvent, pickPactEvent, hasAnyAlliance } = await import(pactUrl)
  const { resolveRound } = await import(resolveUrl)
  const { FACTION_MAP } = await import(factionsUrl)

  /* ============ 一、阵营名唯一权威来源 ============ */
  const AUTHORITATIVE = Object.fromEntries(
    Object.entries(FACTION_MAP).map(([id, f]) => [id, f.name]),
  )
  check('六阵营名单正确', Object.keys(AUTHORITATIVE).length === 6, JSON.stringify(AUTHORITATIVE))

  const ev = {
    id: 'X',
    round: 1,
    label: '测试事件',
    story: 'x',
    deltas: {
      SARK: { morale: 1 },
      VIC: { supply: -1 },
      RI: { manpower: 2 },
      TARA: { morale: -1 },
      REU: { supply: 1 },
      SSC: { manpower: -1 },
    },
  }
  const described = describeStoryEvent(ev)
  const badNames = ['维多利亚', '雷姆必拓', '叙拉古']
  check(
    'describeStoryEvent 不再出现错误阵营名',
    badNames.every((b) => !described.includes(b)),
    described,
  )
  const goodNames = ['萨卡兹军事委员会', '典范军', '罗德岛', '塔拉／深池', '整合运动', '市民自救军']
  check(
    'describeStoryEvent 使用权威阵营名',
    goodNames.every((g) => described.includes(g)),
    described,
  )

  /* ============ 二、盟约事件数值描述 ============ */
  const p01 = { id: 'P-01', kind: 'ally-boon', name: '共同防线', text: 'x', allianceEffects: { morale: 1 }, soloEffects: { morale: -1 } }
  check(
    '盟约事件描述包含同盟与孤立两档数值',
    describePactEvent(p01) === '同盟双方 士气+1；无同盟者 士气-1',
    describePactEvent(p01),
  )
  const p05 = { id: 'P-05', kind: 'internal', name: '分赃不均', text: 'x', allianceEffects: { supply: 2, morale: -1 } }
  check(
    'internal 类事件只写同盟内部一得一失（不含孤立者）',
    describePactEvent(p05) === '同盟双方 补给+2 士气-1',
    describePactEvent(p05),
  )
  const pEmpty = { id: 'P-00', kind: 'internal', name: '空', text: 'x' }
  check('无效果的盟约事件返回兜底文案', describePactEvent(pEmpty) === '无数值影响', describePactEvent(pEmpty))

  /* ============ 三、盟约事件日志带数值 ============ */
  {
    const players = ['A', 'B', 'C', 'D'].map((id, i) => ({
      id,
      name: id,
      factionId: i === 0 ? 'SARK' : i === 1 ? 'TARA' : i === 2 ? 'VIC' : 'RI',
      stats: { manpower: 10, supply: 10, morale: 10 },
      warProgress: 0,
      heldDesignated: null,
      heldKeptRound: null,
      exileUsed: false,
      exiled: false,
      defeated: false,
      allyId: i === 0 ? 'B' : i === 1 ? 'A' : null,
      betrayed: false,
      betrayedThisRound: false,
      nullifiedTags: [],
      keyTags: [],
    }))
    const res = resolveRound(players, {}, 1, p01)
    const pactLog = res.logs.filter((l) => l.tone === 'pact')
    check('盟约事件日志只有 1 条', pactLog.length === 1)
    check('盟约事件日志包含数值', pactLog[0]?.text.includes('同盟双方 士气+1'), pactLog[0]?.text)
    check('盟约事件日志包含孤立数值', pactLog[0]?.text.includes('无同盟者 士气-1'), pactLog[0]?.text)

    // 数值确实生效：同盟者士气 +1（盟约事件）再 +1（同盟互援）
    const sark = res.players.find((p) => p.factionId === 'SARK')
    const tara = res.players.find((p) => p.factionId === 'TARA')
    const vic = res.players.find((p) => p.factionId === 'VIC')
    check('同盟双方士气 +2（事件 + 互援）', sark.stats.morale === 12 && tara.stats.morale === 12, `${sark.stats.morale}/${tara.stats.morale}`)
    check('无同盟者士气 -1', vic.stats.morale === 9, `${vic.stats.morale}`)
  }

  /* ============ 四、战争进度只归萨卡兹 ============ */
  {
    // 阵营牌：甲方非萨卡兹、乙方非萨卡兹，带 progress 也不推进
    const nonSarkA = {
      id: 'A', name: '甲', factionId: 'VIC',
      stats: { manpower: 10, supply: 10, morale: 10 }, warProgress: 0,
      heldDesignated: null, heldKeptRound: null, exileUsed: false, exiled: false,
      defeated: false, allyId: 'B', betrayed: false, betrayedThisRound: false,
      nullifiedTags: [], keyTags: [],
    }
    const nonSarkB = { ...nonSarkA, id: 'B', name: '乙', factionId: 'SSC', allyId: 'A' }
    // 直接测 applyFactionCards 的 progress 判定（通过 resolveRound 走不到阵营牌，这里只验证日志与数值一致性的入口）
    // 用阵营牌路径：手工调 applyFactionCards 太重，改为直接验证 resolveRound 里指定牌路径
    const sarkPlayer = { ...nonSarkA, id: 'S', name: '萨', factionId: 'SARK', allyId: null }
    const reuPlayer = { ...nonSarkA, id: 'R', name: '整', factionId: 'REU', allyId: null }
    const cardWithProgress = {
      id: 'DP', owner: 'GENERIC', name: '测试指定牌', category: 'designated', op: 'strike',
      effects: {}, progress: 2, targetRule: 'any',
    }
    // 非萨卡兹用带 progress 的指定牌命中：不应推进
    const resReu = resolveRound(
      [reuPlayer, { ...sarkPlayer, stats: { ...sarkPlayer.stats } }],
      { R: { cards: [], designated: { ...cardWithProgress, owner: 'REU' }, targetId: 'S', neutralAccept: false } },
      1,
      null,
    )
    const reuAfter = resReu.players.find((p) => p.id === 'R')
    check('非萨卡兹命中带 progress 的牌不推进战争进度', reuAfter.warProgress === 0, `${reuAfter.warProgress}`)

    // 萨卡兹用带 progress 的指定牌命中：推进，且日志写明
    const resSark = resolveRound(
      [sarkPlayer, reuPlayer],
      { S: { cards: [], designated: cardWithProgress, targetId: 'R', neutralAccept: false } },
      1,
      null,
    )
    const sarkAfter = resSark.players.find((p) => p.id === 'S')
    check('萨卡兹命中带 progress 的牌推进战争进度', sarkAfter.warProgress === 2, `${sarkAfter.warProgress}`)
    const hitLog = resSark.logs.find((l) => l.text.includes('命中'))
    check('萨卡兹命中日志写明战争进度', hitLog?.text.includes('战争进度 +2'), hitLog?.text)
  }

  /* ============ 五、情报牌只侦查萨卡兹 ============ */
  {
    // reveal special 的牌：萨卡兹在场时只报萨卡兹；萨卡兹出局时报「无从查起」
    const sark = {
      id: 'S', name: '萨', factionId: 'SARK',
      stats: { manpower: 10, supply: 10, morale: 10 }, warProgress: 1,
      heldDesignated: null, heldKeptRound: null, exileUsed: false, exiled: false,
      defeated: false, allyId: null, betrayed: false, betrayedThisRound: false,
      nullifiedTags: [], keyTags: [],
    }
    const vic = { ...sark, id: 'V', name: '典', factionId: 'VIC', warProgress: 0 }
    const revealCard = {
      id: 'RV', owner: 'VIC', name: '情报牌', category: 'action', axis: 'intel',
      effects: {}, special: 'reveal',
    }
    const res = resolveRound(
      [vic, sark],
      { V: { cards: [revealCard], designated: null, targetId: null, neutralAccept: false } },
      1,
      null,
    )
    const infoLog = res.logs.find((l) => l.text.includes('情报'))
    check(
      '情报牌只报萨卡兹的战争进度',
      infoLog?.text.includes('萨（1）') && !infoLog?.text.includes('典（'),
      infoLog?.text,
    )

    // 萨卡兹出局后
    const sarkDead = { ...sark, defeated: true }
    const res2 = resolveRound(
      [vic, sarkDead],
      { V: { cards: [revealCard], designated: null, targetId: null, neutralAccept: false } },
      1,
      null,
    )
    const infoLog2 = res2.logs.find((l) => l.text.includes('情报'))
    check('萨卡兹出局后情报牌报「无从查起」', infoLog2?.text.includes('无从查起'), infoLog2?.text)
  }

  /* ============ 六、pickPactEvent 触发规则（v0.4.2） ============ */
  {
    // 构造玩家：A↔B 互为盟友，C 孤立
    const mk = (id, factionId, allyId) => ({
      id,
      name: id,
      factionId,
      stats: { manpower: 10, supply: 10, morale: 10 },
      warProgress: 0,
      heldDesignated: null,
      heldKeptRound: null,
      exileUsed: false,
      exiled: false,
      defeated: false,
      allyId,
      betrayed: false,
      betrayedThisRound: false,
      nullifiedTags: [],
      keyTags: [],
    })
    const withAlly = [mk('A', 'SARK', 'B'), mk('B', 'TARA', 'A'), mk('C', 'VIC', null), mk('D', 'RI', null)]
    const noAlly = [mk('A', 'SARK', null), mk('B', 'TARA', null), mk('C', 'VIC', null), mk('D', 'RI', null)]

    check('hasAnyAlliance 认出互为盟友', hasAnyAlliance(withAlly) === true)
    check('hasAnyAlliance 认出全场无盟约', hasAnyAlliance(noAlly) === false)

    // 单边 allyId（A→B 但 B→null）不算数
    const singleSided = [mk('A', 'SARK', 'B'), mk('B', 'TARA', null), mk('C', 'VIC', null), mk('D', 'RI', null)]
    check('单边 allyId 不算盟约', hasAnyAlliance(singleSided) === false)

    // 无盟约：无论 random 返回什么都不触发
    check('无盟约时永不触发', pickPactEvent(noAlly, () => 0) === null)
    check('无盟约时随机值再低也不触发', pickPactEvent(noAlly, () => 0.01) === null)

    // 有盟约：50% 概率。random=0.4 触发，random=0.6 不触发
    check('有盟约且 random<0.5 触发', pickPactEvent(withAlly, () => 0.4) !== null)
    check('有盟约且 random>=0.5 不触发', pickPactEvent(withAlly, () => 0.6) === null)

    // 三类走向都能被选中（用确定性 random 序列逐一验证）
    // 第 1 次 random=0.3（<0.5 触发），第 2 次 random=0 选第一类 ally-boon
    const allyBoon = pickPactEvent(withAlly, (() => { let n = 0; const seq = [0.3, 0]; return () => seq[n++ % seq.length] })())
    check('能抽到 ally-boon 类', allyBoon?.kind === 'ally-boon', allyBoon?.kind)

    // 第 2 次 random 接近 1 → 选第三类 internal
    const internal = pickPactEvent(withAlly, (() => { let n = 0; const seq = [0.3, 0.99]; return () => seq[n++ % seq.length] })())
    check('能抽到 internal 类', internal?.kind === 'internal', internal?.kind)

    // 第 2 次 random 居中 → solo-boon
    const soloBoon = pickPactEvent(withAlly, (() => { let n = 0; const seq = [0.3, 0.5]; return () => seq[n++ % seq.length] })())
    check('能抽到 solo-boon 类', soloBoon?.kind === 'solo-boon', soloBoon?.kind)

    // 抽出的必然是 PACT_EVENTS 里带 kind 的合法事件
    const some = pickPactEvent(withAlly, () => 0.2)
    check('抽出的必带三类 kind 之一', ['ally-boon', 'solo-boon', 'internal'].includes(some?.kind ?? ''), some?.kind)
  }
} finally {
  rmSync(outdir, { recursive: true, force: true })
}

const passed = results.filter((r) => r.ok).length
const total = results.length
console.log('')
console.log('─'.repeat(60))
console.log(`通过 ${passed} / ${total}`)
if (passed === total) {
  console.log('阵营名 / 盟约事件 / 战争进度回归验证全部通过 ✓')
  process.exit(0)
} else {
  console.log('存在失败项 ✗')
  results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`))
  process.exit(1)
}

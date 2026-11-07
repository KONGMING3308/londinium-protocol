/**
 * 剧情事件（三选一随机）与中立资源竞标验证。
 *
 * 这一版补两块 v0.3.0 缺失的内容：
 *   1. 剧情事件：之前是「第 N 回合固定用第 N 条」，七回合就是一套写死的剧本，
 *      打两局玩家就能背下来。现在每回合从 3 个候选里随机抽 1 个，对全场生效。
 *   2. 中立资源竞标：之前的中立援助是「人手一张、各抽各的」，四人零交互。
 *      现在每回合刷 2 个资源点，四人秘密出价、最高价独得、其余不退。
 *
 * 用法：node scripts/test-story-bid.mjs
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

async function load() {
  const outdir = mkdtempSync(join(tmpdir(), 'londinium-story-'))
  const build1 = async (rel, name) => {
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
    return outfile
  }
  const engineOut = await build1('src/game/engine.ts', 'engine.mjs')
  const storyOut = await build1('src/utils/game/story.ts', 'story.mjs')
  const bidOut = await build1('src/utils/game/bid.ts', 'bid.mjs')
  const eventsOut = await build1('src/mocks/story.ts', 'events.mjs')
  return {
    engine: await import(pathToFileURL(engineOut).href),
    story: await import(pathToFileURL(storyOut).href),
    bid: await import(pathToFileURL(bidOut).href),
    events: await import(pathToFileURL(eventsOut).href),
    cleanup: () => rmSync(outdir, { recursive: true, force: true }),
  }
}

const { engine: E, story, bid, events, cleanup } = await load()

/** 建一个打到 picking 阶段的对局 */
function setup(roomId = 'SB') {
  let state = E.createEngine(roomId)
  const seats = []
  for (let i = 0; i < 4; i += 1) {
    const r = E.joinAsPlayer(state, `P${i + 1}`)
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

function pickActions(hand) {
  return hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC').slice(0, 2)
}

try {
  /* ================= 一、剧情事件池本身 ================= */
  check('7 个回合都有候选事件', [1, 2, 3, 4, 5, 6, 7].every((r) => events.storyCandidates(r).length >= 3))
  check(
    '每回合恰好 3 个候选（三选一）',
    [1, 2, 3, 4, 5, 6, 7].every((r) => events.storyCandidates(r).length === 3),
  )
  const allIds = events.STORY_EVENTS.map((e) => e.id)
  check('事件 id 全局唯一', new Set(allIds).size === allIds.length, `${allIds.length} 条`)
  check(
    '每条事件都对 6 个阵营给出了数值影响',
    events.STORY_EVENTS.every((e) => Object.keys(e.deltas).length === 6),
  )
  check(
    '每条事件都至少让一个阵营受损（不存在全场纯赚）',
    events.STORY_EVENTS.every((e) =>
      Object.values(e.deltas).some((d) => Object.values(d).some((v) => (v ?? 0) < 0)),
    ),
  )
  check(
    '每条事件都至少让一个阵营受益',
    events.STORY_EVENTS.every((e) =>
      Object.values(e.deltas).some((d) => Object.values(d).some((v) => (v ?? 0) > 0)),
    ),
  )
  check(
    '单项幅度不超过 ±3（防止一个事件直接定胜负）',
    events.STORY_EVENTS.every((e) =>
      Object.values(e.deltas).every((d) =>
        Object.values(d).every((v) => Math.abs(v ?? 0) <= 3),
      ),
    ),
  )

  /* ================= 二、随机抽取确实随机 ================= */
  {
    // 用确定性 random 验证边界：0 → 第一个，接近 1 → 最后一个
    const first = story.pickStoryEvent(1, () => 0)
    const last = story.pickStoryEvent(1, () => 0.999999)
    const pool = events.storyCandidates(1)
    check('random=0 抽到第一个候选', first.id === pool[0].id, first.id)
    check('random→1 抽到最后一个候选', last.id === pool[2].id, last.id)

    // 真实随机：跑 300 次，三个候选都应该出现过
    const seen = new Set()
    for (let i = 0; i < 300; i += 1) seen.add(story.pickStoryEvent(3).id)
    check('随机抽取覆盖全部 3 个候选', seen.size === 3, `出现过 ${seen.size} 个`)
  }

  /* ================= 三、剧情事件真的作用到数值上 ================= */
  {
    const { state, seats } = setup('SB-APPLY')
    const ev = state.storyEvent
    check('开局暗选阶段就带上了剧情事件', Boolean(ev), ev?.id ?? 'null')
    check('剧情事件被记进历史', state.storyHistory.length === 1 && state.storyHistory[0].round === 1)
    check(
      '剧情事件写进了回合日志',
      state.roundLog.some((l) => l.text.includes('本回合剧情') && l.text.includes(ev.label)),
    )

    // 数值核对：把事件 delta 加上去应该正好等于当前值（clamp 之前）
    // 由于 clampToCap 上限 50，正常开局不会触顶，可以直接比
    const roster = E.snapshotFor(state, seats[0], new Set(seats), 1, {
      playerId: seats[0],
      token: 'x',
    }).match.players
    check('公开视图能拿到全部 4 名玩家', roster.length === 4)

    // 直接验证纯函数：applyStoryEvent 的加法结果
    const fakePlayers = [
      { factionId: 'SARK', stats: { manpower: 5, supply: 5, morale: 5 } },
      { factionId: 'VIC', stats: { manpower: 5, supply: 5, morale: 5 } },
    ]
    const applied = story.applyStoryEvent(fakePlayers, ev)
    const ok = (Object.keys(ev.deltas)).every((fid) => {
      const p = applied.find((x) => x.factionId === fid)
      if (!p) return true
      const d = ev.deltas[fid] ?? {}
      return (
        p.stats.manpower === 5 + (d.manpower ?? 0) &&
        p.stats.supply === 5 + (d.supply ?? 0) &&
        p.stats.morale === 5 + (d.morale ?? 0)
      )
    })
    check('applyStoryEvent 按阵营正确加减', ok)
    check('describeStoryEvent 能渲染成人话', story.describeStoryEvent(ev).length > 0, story.describeStoryEvent(ev).slice(0, 40))
  }

  /* ================= 四、竞标：基本规则 ================= */
  {
    const { state, seats } = setup('SB-BID1')
    check('每回合刷出 2 个资源点', state.neutralPoints.length === 2, `${state.neutralPoints.length} 个`)
    check(
      '资源点都有名称 / 奖励 / 最低出价',
      state.neutralPoints.every((p) => p.name && p.minBid >= 1 && Object.keys(p.reward).length > 0),
    )
    check(
      '资源点写进了回合日志',
      state.roundLog.some((l) => l.text.includes('中立资源')),
    )

    const pt = state.neutralPoints[0]
    // 我只出价，其他三人不出 → 我独得
    const before = state.players.find((p) => p.id === seats[0]).stats.supply
    const r = E.submitPick(state, seats[0], {
      actionCardIds: pickActions(state.hands[seats[0]]).map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
      bid: { pointId: pt.id, amount: pt.minBid },
    })
    check('提交带出价的选牌成功', !r.error, r.error ?? '')
    check('出价被记进 bids', Boolean(r.state.bids[seats[0]]), JSON.stringify(r.state.bids[seats[0]]))
    check('自己的出价通过 myBid 下发', r.state.bids[seats[0]].amount === pt.minBid)
    check('出价尚未扣钱（结算时才扣）', r.state.players.find((p) => p.id === seats[0]).stats.supply === before)

    void pt
  }

  /* ================= 五、竞标：非法出价被拒 ================= */
  {
    const { state, seats } = setup('SB-BID2')
    // minBid=1 的点，1-1=0 属于合法的「不参与」，所以要挑 minBid>=2 的点来测拒绝
    const pt = state.neutralPoints.find((p) => p.minBid >= 2) ?? state.neutralPoints[0]
    if (pt.minBid < 2) throw new Error('测试需要至少一个 minBid>=2 的资源点')

    const low = E.submitPick(state, seats[0], {
      actionCardIds: pickActions(state.hands[seats[0]]).map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
      bid: { pointId: pt.id, amount: pt.minBid - 1 },
    })
    check('低于最低出价被拒', Boolean(low.error), low.error ?? '')

    const badPoint = E.submitPick(state, seats[0], {
      actionCardIds: pickActions(state.hands[seats[0]]).map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
      bid: { pointId: 'NOT-A-POINT', amount: 5 },
    })
    check('指向不存在的资源点被拒', Boolean(badPoint.error), badPoint.error ?? '')

    const negative = E.submitPick(state, seats[0], {
      actionCardIds: pickActions(state.hands[seats[0]]).map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
      bid: { pointId: pt.id, amount: -3 },
    })
    check('负数出价被拒', Boolean(negative.error), negative.error ?? '')

    const float = E.submitPick(state, seats[0], {
      actionCardIds: pickActions(state.hands[seats[0]]).map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
      bid: { pointId: pt.id, amount: 2.5 },
    })
    check('小数出价被拒', Boolean(float.error), float.error ?? '')

    const zeroWithPoint = E.submitPick(state, seats[0], {
      actionCardIds: pickActions(state.hands[seats[0]]).map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
      bid: { pointId: pt.id, amount: 0 },
    })
    check('选了资源点但出价 0 视为不参与（合法）', !zeroWithPoint.error, zeroWithPoint.error ?? '')
    // 出价 0 不应写入 bids 表，否则会污染「已出价人数」
    check('出价 0 不计入 bids（bidCount 不受污染）', !zeroWithPoint.state.bids[seats[0]], JSON.stringify(zeroWithPoint.state.bids))
  }

  /* ================= 六、竞标：最高价独得 + 输家照扣 ================= */
  {
    const { state: s0, seats } = setup('SB-BID3')
    // 资源点是随机抽的，minBid 不固定 —— 出价必须按实际 minBid 来算，不能硬编码
    const pt = [...s0.neutralPoints].sort((a, b) => a.minBid - b.minBid)[0]
    const base = pt.minBid
    let state = s0

    // P1 出 base+2、P2 出 base、P3 出 base+1、P4 不出 → P1 独得，P2/P3 的钱照扣
    const amounts = [base + 2, base, base + 1, null]
    seats.forEach((id, i) => {
      const amt = amounts[i]
      const r = E.submitPick(state, id, {
        actionCardIds: pickActions(state.hands[id]).map((c) => c.id),
        neutralAccept: false,
        designated: { play: null, keep: null },
        targetId: null,
        bid: amt === null ? null : { pointId: pt.id, amount: amt },
      })
      if (r.error) throw new Error(`提交失败 seat${i}: ${r.error}`)
      state = r.state
    })
    check('四人都已提交', Object.keys(state.picks).length === 4, `${Object.keys(state.picks).length} 人`)
    check('阶段推进到盟约窗口', state.phase === 'council', state.phase)

    // 结算
    seats.forEach((id) => {
      state = E.councilReady(state, id).state
    })
    check('结算完成', state.phase === 'resolved', state.phase)
    // 这里刻意不做精确数值断言：结算同时发生了「竞标扣钱/发奖」和
    // 「打出的 2 张行动牌各自的代价与收益」，两者混在同一个补给数里无法归因。
    // 竞标的精确数值由第十一节对 resolveBids 纯函数的用例覆盖。

    // 结果公开
    check('结算后公开竞标结果', state.bidResults.length > 0, `${state.bidResults.length} 条`)
    const res = state.bidResults.find((r) => r.pointId === pt.id)
    check('结果记录了赢家', res?.winnerId === seats[0], res?.winnerName ?? '')
    check('结果记录了胜出价', res?.winningBid === base + 2, `${res?.winningBid}（期望 ${base + 2}）`)
    check('结果列出了所有人的出价（复盘用）', res?.bids.length === 3, `${res?.bids.length} 条`)
    check(
      '竞标结果写进了日志',
      state.roundLog.some((l) => l.text.includes(pt.name) && l.text.includes('夺得')),
    )
    check('结算后清空出价表', Object.keys(state.bids).length === 0)
  }

  /* ================= 七、竞标：并列最高价流拍且照扣 ================= */
  {
    const { state: s0, seats } = setup('SB-BID4')
    const pt = [...s0.neutralPoints].sort((a, b) => a.minBid - b.minBid)[0]
    const base = pt.minBid
    let state = s0

    // P1 与 P2 都出 base → 并列 → 流拍，两人都照扣
    seats.forEach((id, i) => {
      const amt = i < 2 ? base : null
      const r = E.submitPick(state, id, {
        actionCardIds: pickActions(state.hands[id]).map((c) => c.id),
        neutralAccept: false,
        designated: { play: null, keep: null },
        targetId: null,
        bid: amt === null ? null : { pointId: pt.id, amount: amt },
      })
      if (r.error) throw new Error(r.error)
      state = r.state
    })
    seats.forEach((id) => {
      state = E.councilReady(state, id).state
    })

    const res = state.bidResults.find((r) => r.pointId === pt.id)
    check('并列最高价 → 流拍（无人得奖）', res?.winnerId === null && res?.tied === true)
    check('流拍时记录了并列最高价', res?.winningBid === base, `${res?.winningBid}（期望 ${base}）`)
    check(
      '流拍写进日志',
      state.roundLog.some((l) => l.text.includes('流拍')),
    )
    check('流拍时没人拿到奖励（结果里无赢家）', res?.winnerName === '')
    // 精确扣款由第十一节纯函数用例验证
  }

  /* ================= 八、竞标：无人出价不扣钱 ================= */
  {
    const { state: s0, seats } = setup('SB-BID5')
    let state = s0
    seats.forEach((id) => {
      const r = E.submitPick(state, id, {
        actionCardIds: pickActions(state.hands[id]).map((c) => c.id),
        neutralAccept: false,
        designated: { play: null, keep: null },
        targetId: null,
      })
      if (r.error) throw new Error(r.error)
      state = r.state
    })
    seats.forEach((id) => {
      state = E.councilReady(state, id).state
    })
    check(
      '无人出价 → 全部流拍',
      state.bidResults.every((r) => r.winnerId === null && !r.tied),
    )
    check(
      '无人出价 → 每个资源点的出价列表都是空的',
      state.bidResults.every((r) => r.bids.length === 0),
    )
  }

  /* ================= 九、竞标：出价保密（脱敏） ================= */
  {
    const { state: s0, seats } = setup('SB-BID6')
    const pt = s0.neutralPoints[0]
    let state = s0
    // P1 出价（用 minBid 与 5 的较大值，保证合法）
    const myAmount = Math.max(pt.minBid, 5)
    state = E.submitPick(state, seats[0], {
      actionCardIds: pickActions(state.hands[seats[0]]).map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
      bid: { pointId: pt.id, amount: myAmount },
    }).state

    const viewP1 = E.snapshotFor(state, seats[0], new Set(seats), 1, { playerId: seats[0], token: 'a' })
    const viewP2 = E.snapshotFor(state, seats[1], new Set(seats), 2, { playerId: seats[1], token: 'b' })
    check('自己能看到自己的出价', viewP1.match.myBid?.amount === myAmount, `${viewP1.match.myBid?.amount}`)
    check('别人看不到我的出价', viewP2.match.myBid === null)
    check('但能看到「已出价人数」', viewP2.match.bidCount === 1, `${viewP2.match.bidCount}`)
    check(
      '公开玩家列表里没有出价信息',
      viewP2.match.players.every((p) => !('bid' in p) && !('myBid' in p)),
    )
    check(
      '结算前的 bidResults 为空（结果还没生成）',
      viewP2.match.bidResults.length === 0,
    )
  }

  /* ================= 十、托管不会替玩家出价 ================= */
  {
    const { state: s0, seats } = setup('SB-AUTO')
    let state = s0
    // 其他三人正常提交，P4 交给托管
    for (let i = 0; i < 3; i += 1) {
      state = E.submitPick(state, seats[i], {
        actionCardIds: pickActions(state.hands[seats[i]]).map((c) => c.id),
        neutralAccept: false,
        designated: { play: null, keep: null },
        targetId: null,
      }).state
    }
    const auto = E.autoActFor(state, seats[3])
    check('托管成功提交', !auto.error && auto.did === 'submitPick', auto.error ?? auto.did)
    check('托管没有替玩家出价（保守原则）', !auto.state.bids[seats[3]], JSON.stringify(auto.state.bids[seats[3]] ?? null))
    check('托管推进到盟约窗口', auto.state.phase === 'council', auto.state.phase)
  }

  /* ================= 十一、纯函数直接测 resolveBids ================= */
  {
    const players = ['p1', 'p2', 'p3', 'p4'].map((id, i) => ({
      id,
      name: id,
      factionId: 'SARK',
      stats: { manpower: 10, supply: 10, morale: 10 },
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
      isHost: i === 0,
      ready: true,
      briefingAck: true,
      councilReady: false,
      readyNext: false,
    }))
    const points = [{ id: 'X', name: '测试点', reward: { supply: 4 }, flavor: '', minBid: 2 }]

    // 只有一个有效出价 → 独得
    const one = bid.resolveBids(players, points, { p1: { pointId: 'X', amount: 2 } }, 1)
    check('纯函数：单人出价独得', one.players[0].stats.supply === 10 - 2 + 4, `${one.players[0].stats.supply}`)
    check('纯函数：未出价者不变', one.players[1].stats.supply === 10)

    // 低于 minBid 的出价视为无效
    const low = bid.resolveBids(players, points, { p1: { pointId: 'X', amount: 1 } }, 1)
    check('纯函数：低于 minBid 视为未出价', low.players[0].stats.supply === 10 && low.results[0].winnerId === null)

    // 并列
    const tie = bid.resolveBids(
      players,
      points,
      { p1: { pointId: 'X', amount: 3 }, p2: { pointId: 'X', amount: 3 } },
      1,
    )
    check('纯函数：并列流拍且双方都扣', tie.players[0].stats.supply === 7 && tie.players[1].stats.supply === 7)
    check('纯函数：并列标记 tied', tie.results[0].tied === true)

    // 三个点各投一人
    const pts3 = [
      { id: 'A', name: 'A点', reward: { supply: 2 }, flavor: '', minBid: 1 },
      { id: 'B', name: 'B点', reward: { morale: 2 }, flavor: '', minBid: 1 },
      { id: 'C', name: 'C点', reward: { manpower: 2 }, flavor: '', minBid: 1 },
    ]
    const multi = bid.resolveBids(
      players,
      pts3,
      {
        p1: { pointId: 'A', amount: 1 },
        p2: { pointId: 'B', amount: 1 },
        p3: { pointId: 'C', amount: 1 },
        p4: { pointId: 'A', amount: 5 },
      },
      1,
    )
    check('纯函数：多人分散抢点各自结算', multi.results.length === 3, `${multi.results.length}`)
    check('纯函数：A 点被出价高者拿下', multi.results[0].winnerId === 'p4', multi.results[0].winnerName)

    // 出局玩家不参与
    const withDead = players.map((p, i) => (i === 1 ? { ...p, defeated: true } : p))
    const dead = bid.resolveBids(withDead, points, { p2: { pointId: 'X', amount: 5 } }, 1)
    check('纯函数：出局玩家的出价被忽略', dead.players[1].stats.supply === 10 && dead.results[0].winnerId === null)
  }

  /* ================= 十二、多回合连续竞标不串号 ================= */
  {
    const { state: s0, seats } = setup('SB-MULTI')
    let state = s0
    const round1PointName = state.neutralPoints[0].name

    // 打完 R1
    seats.forEach((id) => {
      const pt = state.neutralPoints[0]
      state = E.submitPick(state, id, {
        actionCardIds: pickActions(state.hands[id]).map((c) => c.id),
        neutralAccept: false,
        designated: { play: null, keep: null },
        targetId: null,
        bid: { pointId: pt.id, amount: 2 },
      }).state
    })
    seats.forEach((id) => {
      state = E.councilReady(state, id).state
    })
    check('R1 结算后进入 resolved', state.phase === 'resolved', state.phase)
    seats.forEach((id) => {
      state = E.readyNext(state, id).state
    })
    check('进入 R2', state.round === 2 && state.phase === 'picking', `r=${state.round} ${state.phase}`)
    check('R2 重新刷出资源点', state.neutralPoints.length === 2)
    check('R2 的出价表是空的', Object.keys(state.bids).length === 0)
    check('R1 的竞标结果被清空（属于上一回合）', state.bidResults.length === 0)
    void round1PointName

    // R2 只出 1 个人，验证新回合独立结算
    const pt2 = state.neutralPoints[1]
    state = E.submitPick(state, seats[0], {
      actionCardIds: pickActions(state.hands[seats[0]]).map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
      targetId: null,
      bid: { pointId: pt2.id, amount: pt2.minBid },
    }).state
    check('R2 的出价指到 R2 的资源点', state.bids[seats[0]].pointId === pt2.id)
  }
} finally {
  cleanup()
}

const passed = results.filter((r) => r.ok).length
const total = results.length
console.log('')
console.log('─'.repeat(60))
console.log(`通过 ${passed} / ${total}`)
if (passed === total) {
  console.log('剧情事件与中立竞标验证全部通过 ✓')
  process.exit(0)
} else {
  console.log('存在失败项 ✗')
  results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`))
  process.exit(1)
}

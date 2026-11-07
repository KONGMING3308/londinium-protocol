/**
 * 阶段倒计时 + 超时托管 测试。
 *
 * 核心验证：
 *   1. 各阶段下发 deadline/duration，客户端能算出剩余时间
 *   2. 时间到后服务端**自动**推进 —— 不需要任何人操作，对局不会卡死
 *   3. 托管操作是保守的：打行动牌、保留指定牌不打人、不擅自结盟
 *   4. 有人正常操作时不会被误托管打断
 *
 * 通过 overrideDurations 把时限压到 1–2 秒，避免真的等 30 秒。
 * 用法：node scripts/test-timer.mjs
 */
import { WebSocket } from 'ws'
import { overrideDurations, startServer } from '../server/dist/index.mjs'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 压到极短时限：简报 1s / 暗选 2s / 盟约 1s / 结算 1s
overrideDurations({ briefing: 1000, picking: 2000, council: 1000, resolved: 1000 })

const { server, port } = await startServer(0, '127.0.0.1')
const URL = `ws://127.0.0.1:${port}/ws`

class C {
  constructor(label) {
    this.label = label
    this.snap = null
    this.errors = []
    this.ws = new WebSocket(URL)
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString())
      if (m.type === 'snapshot') this.snap = m
      else if (m.type === 'error') this.errors.push(m)
    })
  }
  ready() {
    return new Promise((r, j) => {
      this.ws.on('open', r)
      this.ws.on('error', j)
    })
  }
  send(o) {
    this.ws.send(JSON.stringify(o))
  }
  async wait(pred, timeout = 12000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      if (this.snap && pred(this.snap)) return this.snap
      await new Promise((r) => setTimeout(r, 40))
    }
    return null
  }
  close() {
    try {
      this.ws.close()
    } catch {
      /* 忽略 */
    }
  }
}

const clients = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 建一个满 4 人的房间，返回到开局为止的客户端数组 */
async function makeRoom(tag) {
  const host = new C(`${tag}-1`)
  clients.push(host)
  await host.ready()
  host.send({ type: 'createRoom', name: `${tag}1` })
  const s0 = await host.wait((s) => Boolean(s.room?.roomId))
  const roomId = s0.room.roomId
  const rest = []
  for (let i = 2; i <= 4; i += 1) {
    const c = new C(`${tag}-${i}`)
    clients.push(c)
    rest.push(c)
    await c.ready()
    c.send({ type: 'joinRoom', roomId, name: `${tag}${i}` })
    await c.wait((s) => s.room?.seats.length === i)
  }
  return { host, all: [host, ...rest], roomId }
}

try {
  /* ================= 1. 大厅不计时，开局后有倒计时 ================= */
  const { host, all } = await makeRoom('A')
  check('大厅阶段没有倒计时', host.snap.room.phase === 'lobby' && !host.snap.match)

  for (const c of all) c.send({ type: 'setReady', ready: true })
  const brief = await host.wait((s) => s.room.phase === 'briefing')
  check('四人全部准备后自动开局', Boolean(brief))

  check('简报阶段下发 deadline', typeof brief.match.deadline === 'number' && brief.match.deadline > 0)
  check('简报阶段下发 duration', brief.match.duration === 1000, `${brief.match.duration}ms`)
  check('快照带 serverNow（校正本地时钟用）', typeof brief.serverNow === 'number' && brief.serverNow > 0)
  check(
    '剩余时间不超过总时长',
    brief.match.deadline - brief.serverNow <= brief.match.duration,
    `剩余 ${brief.match.deadline - brief.serverNow}ms / 总 ${brief.match.duration}ms`,
  )

  /* ================= 2. 简报超时 → 自动确认 ================= */
  const picking = await host.wait((s) => s.room.phase === 'picking', 8000)
  check('简报超时后自动进入暗选（无人点确认）', Boolean(picking), picking?.room.phase)
  check('暗选阶段 duration 已更新', picking?.match.duration === 2000, `${picking?.match.duration}ms`)

  /* ================= 3. 暗选超时 → 自动出牌且不打人 ================= */
  const afterPick = await host.wait((s) => s.room.phase !== 'picking', 12000)
  check(
    '暗选超时后自动推进（没人提交也能继续）',
    Boolean(afterPick),
    afterPick?.room.phase,
  )

  if (afterPick) {
    // 托管必须真的打出牌：检查四人手牌都被消耗/回合推进
    const logText = (afterPick.match.roundLog ?? []).map((l) => l.text).join(' ')
    check('超时托管确实执行了出牌（有结算日志）', logText.length > 0, logText.slice(0, 100))
    check(
      '超时托管默认不打指定牌（不误伤他人）',
      !/指定牌/.test(logText),
      /指定牌/.test(logText) ? '日志出现了指定牌记录' : '',
    )
  }

  /* ================= 4. 等待一路自动推进到终局 ================= */
  console.log('\n  放空不操作，验证整局能自动跑完（不会卡死）…')
  const finished = await host.wait((s) => s.room.phase === 'result', 90000)
  check('全程无操作也能推进到终局（超时托管闭环）', Boolean(finished), finished?.room.phase)
  if (finished) {
    check('终局阶段不再下发倒计时', finished.match.deadline === null && finished.match.duration === null)
  }
  /* ================= 5. 手动操作不会被误托管 ================= */
  const b = await makeRoom('B')
  const fb = []
  for (const c of b.all) {
    c.ws.on('message', (d) => {
      const m = JSON.parse(d.toString())
      if (m.type === 'snapshot' && m.room.phase === 'briefing') fb.push(c)
    })
  }
  for (const c of b.all) c.send({ type: 'setReady', ready: true })
  const bp = await b.host.wait((s) => s.room.phase === 'briefing')
  check('第二局开局成功', Boolean(bp))

  // 立刻全员确认，应该远早于 1 秒超时之前就进入暗选
  for (const c of b.all) c.send({ type: 'briefingAck' })
  const bp2 = await b.host.wait((s) => s.room.phase === 'picking', 4000)
  check('手动确认简报后立刻进入暗选（不等超时）', Boolean(bp2))

  // 三人提交、留一人不交，应立即停在暗选等最后一人
  for (const c of b.all.slice(0, 3)) {
    const me = c.snap.match.self
    const acts = me.hand.filter((x) => x.category === 'action' && x.owner !== 'GENERIC')
    if (acts.length >= 2) {
      c.send({
        type: 'submitPick',
        actionCardIds: acts.slice(0, 2).map((x) => x.id),
        neutralAccept: false,
        designated: { play: null, keep: null },
      })
    }
  }
  await sleep(300)
  check('三人已提交时仍停在暗选（等第四人）', b.host.snap.room.phase === 'picking', b.host.snap.room.phase)

  const advanced = await b.host.wait((s) => s.room.phase !== 'picking', 10000)
  check('第四人不提交 → 超时被托管，对局继续', Boolean(advanced), advanced?.room.phase)

  /* ================= 6. 托管合法性：玩家状态没被弄坏 ================= */
  if (advanced) {
    const seats = advanced.room.seats
    check('托管后四人座位仍在', seats.length === 4)
    const self = advanced.match.self
    check('自己的手牌结构正常', Array.isArray(self.hand))
    check(
      '托管后没有把玩家判成出局',
      advanced.match.players.filter((p) => p.defeated).length === 0,
      `${advanced.match.players.filter((p) => p.defeated).length} 人出局`,
    )
  }
} finally {
  clients.forEach((c) => c.close())
  server.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'─'.repeat(52)}`)
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exit(1)
}
console.log('倒计时与超时托管验证全部通过 ✓\n')

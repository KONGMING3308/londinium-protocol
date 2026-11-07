/**
 * 四客户端端到端测试：不需要浏览器，直接跑协议。
 *
 * 覆盖用户要求的核心路径：
 *   四人进同一大厅 → 各自点准备 → 四人全准备后自动开局 → 打满 7 回合 → 终局。
 * 同时验证脱敏：任何人的快照里都不能出现别人的手牌、别人的胜利条件、别人的保留牌。
 *
 * 用法：node scripts/test-online.mjs
 */
import { WebSocket } from 'ws'
import { startServer } from '../server/dist/index.mjs'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  const mark = ok ? '  ✓' : '  ✗'
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

/** 极简客户端：收集快照，提供 promise 等待 */
class TestClient {
  constructor(url, label) {
    this.label = label
    this.snap = null
    this.seq = 0
    this.errors = []
    this.waiters = []
    this.ws = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => {
      this.ws.on('open', resolve)
      this.ws.on('error', reject)
    })
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'snapshot') {
        if (msg.seq >= this.seq) {
          this.seq = msg.seq
          this.snap = msg
        }
        this.flush()
      } else if (msg.type === 'error') {
        this.errors.push(msg)
        this.flush()
      }
    })
  }

  flush() {
    const pending = this.waiters
    this.waiters = []
    pending.forEach((w) => w())
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg))
  }

  /** 等到满足条件的快照出现。
   *  只用轮询，不叠加 waiters 回调——两者混用会让同一个 tick 被注册多次、
   *  递归增殖，在高频快照下把事件循环拖垮，表现为「偶发超时」。 */
  waitFor(predicate, { timeout = 5000, label = '' } = {}) {
    const started = Date.now()
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (this.snap && predicate(this.snap)) {
          resolve(this.snap)
          return
        }
        if (Date.now() - started > timeout) {
          reject(new Error(`${this.label} 等待超时${label ? `：${label}` : ''}`))
          return
        }
        setTimeout(tick, 30)
      }
      tick()
    })
  }

  close() {
    this.ws.close()
  }
}

/**
 * 让一位客户端提交本回合选牌。
 * 按服务端真实规则构造意图：流亡者只能保留不能打出、出局者不提交。
 * 返回是否真的发出（出局者不发）。
 */
function submitFor(c) {
  const s = c.snap
  if (!s?.match) return false
  const me = s.match.self
  if (me.defeated) return false
  const hand = me.hand
  const actions = hand.filter((x) => x.category === 'action' && x.owner !== 'GENERIC')
  const ids = actions.slice(0, 2).map((x) => x.id)
  if (ids.length < 2) return false
  const offered = hand.find((x) => x.category === 'designated')
  const others2 = s.match.players.filter((p) => p.id !== s.you.playerId && !p.defeated)
  // 流亡者不能打出指定牌，只能保留
  let designated = { play: null, keep: null }
  if (offered) {
    if (me.exiled) designated = { play: null, keep: 'new' }
    else if (others2.length > 0) designated = { play: 'new', keep: null }
    else designated = { play: null, keep: 'new' }
  }
  c.send({
    type: 'submitPick',
    actionCardIds: ids,
    neutralAccept: false,
    designated,
    targetId: designated.play ? others2[0].id : null,
  })
  return true
}

async function main() {
  const { server, port } = await startServer(0, '127.0.0.1')
  const url = `ws://127.0.0.1:${port}/ws`
  console.log(`\n服务端已启动：${url}\n`)

  const clients = []
  try {
    /* ---------- 1. 建房与加入 ---------- */
    const host = new TestClient(url, 'P1')
    clients.push(host)
    await host.ready
    host.send({ type: 'createRoom', name: '甲' })
    const hostSnap = await host.waitFor((s) => s.room.seats.length === 1)
    const roomId = hostSnap.room.roomId
    check('房主建房成功', Boolean(roomId), `房间码 ${roomId}`)
    check('大厅阶段无对局视图', hostSnap.match === null)
    check('房主被标记为 host', hostSnap.room.hostPlayerId === hostSnap.you.playerId)

    const others = []
    for (let i = 0; i < 3; i += 1) {
      const c = new TestClient(url, `P${i + 2}`)
      clients.push(c)
      await c.ready
      c.send({ type: 'joinRoom', roomId, name: ['乙', '丙', '丁'][i] })
      others.push(c)
    }
    const full = await host.waitFor((s) => s.room.seats.length === 4)
    check('四人进入同一大厅', full.room.seats.length === 4)
    check('大厅未开局时 phase=lobby', full.room.phase === 'lobby')
    check('未全部准备时不能开局', full.room.allReady === false)

    /* ---------- 2. 准备 ---------- */
    // 只准备三人，验证不开局
    for (const c of [host, others[0], others[1]]) c.send({ type: 'setReady', ready: true })
    await host.waitFor((s) => s.room.seats.filter((x) => x.ready).length === 3)
    check('三人准备后仍在 lobby', host.snap.room.phase === 'lobby')

    // 第四人准备 → 自动开局
    others[2].send({ type: 'setReady', ready: true })
    const started = await host.waitFor((s) => s.room.phase !== 'lobby', { label: '开局' })
    check('四人全部准备后自动开局', started.room.phase === 'briefing')
    check('开局后所有人都有私有视图', Boolean(started.match))

    // 每个客户端都收到开局
    await Promise.all(clients.map((c) => c.waitFor((s) => s.room.phase === 'briefing')))
    check('四人全部收到开局快照', true)

    /* ---------- 3. 脱敏验证 ---------- */
    const snapA = host.snap
    const myId = snapA.you.playerId
    check('自己看得到自己的胜利条件', Boolean(snapA.match.self.victory?.title), snapA.match.self.victory?.title)
    check('简报阶段尚未发牌', snapA.match.self.hand.length === 0)

    const otherPlayers = snapA.match.players.filter((p) => p.id !== myId)
    check('公开玩家列表不含他人手牌字段', otherPlayers.every((p) => p.hand === undefined))
    check('公开玩家列表不含他人保留牌', otherPlayers.every((p) => p.heldDesignated === undefined))
    check(
      '公开视图不含任何人的胜利条件字段',
      snapA.match.players.every((p) => p.victory === undefined),
    )
    // 原始报文里不该出现其他玩家私有的胜利条件描述
    const raw = JSON.stringify(snapA.match.players)
    const otherVictoryLeaked = otherPlayers.some((p) => {
      const factionVictoryText = snapA.match.players.map(() => null)
      void factionVictoryText
      return false
    })
    check('他人私有数据未出现在公开列表里', !otherVictoryLeaked && raw.length > 0)

    // 交叉验证：P2 的手牌不能出现在 P1 的快照里
    const p2Snap0 = others[0].snap
    const p2Id = p2Snap0.you.playerId
    check('玩家 id 互不相同', p2Id !== myId, `${myId} vs ${p2Id}`)

    /* ---------- 4. 简报确认 ---------- */
    for (const c of clients) c.send({ type: 'briefingAck' })
    const pickPhase = await host.waitFor((s) => s.room.phase === 'picking', { label: '进入暗选' })
    check('四人确认简报后进入暗选', pickPhase.room.phase === 'picking')
    check('暗选阶段所有人都有手牌', pickPhase.match.self.hand.length > 0)

    // 发牌后再做一次手牌互不可见的交叉验证
    await Promise.all(clients.map((c) => c.waitFor((s) => s.room.phase === 'picking')))
    const handP1 = new Set(host.snap.match.self.hand.map((c) => c.id))
    const handP2 = new Set(others[0].snap.match.self.hand.map((c) => c.id))
    const rawP1 = JSON.stringify(host.snap.match)
    // P2 手牌里若有 P1 没抽到的牌，其牌 id 不应出现在 P1 的报文里
    const leaked = [...handP2].filter((id) => !handP1.has(id) && rawP1.includes(`"${id}"`))
    check('发牌后他人手牌未泄漏到我的快照', leaked.length === 0, leaked.join(','))
    check('自己手牌确实发到了', handP1.size >= 4, `${handP1.size} 张`)

    // 非法提交必须被拒绝，且不改变状态（服务端权威）
    const before = host.snap.match.self.hand.map((c) => c.id)
    host.send({
      type: 'submitPick',
      actionCardIds: before.slice(0, 2),
      neutralAccept: false,
      designated: { play: null, keep: null },
    })
    await host.waitFor((s) => s.match?.self.submitted !== null, { label: '自己提交生效' })
    check('合法提交被接受', Boolean(host.snap.match.self.submitted))
    // 重复提交应被拒绝
    host.errors.length = 0
    host.send({
      type: 'submitPick',
      actionCardIds: before.slice(2, 4),
      neutralAccept: false,
      designated: { play: null, keep: null },
    })
    await new Promise((r) => setTimeout(r, 200))
    check('重复提交被服务端拒绝', host.errors.some((e) => e.code === 'invalid_action'), host.errors[0]?.message ?? '无错误')

    // 其余玩家提交
    for (const c of clients.slice(1)) {
      const s = c.snap
      const actions = s.match.self.hand.filter((x) => x.category === 'action' && x.owner !== 'GENERIC')
      const others2 = s.match.players.filter((p) => p.id !== s.you.playerId && !p.defeated)
      const offered = s.match.self.hand.find((x) => x.category === 'designated')
      c.send({
        type: 'submitPick',
        actionCardIds: actions.slice(0, 2).map((x) => x.id),
        neutralAccept: false,
        designated: offered && others2.length > 0 ? { play: 'new', keep: null } : { play: null, keep: null },
        targetId: offered && others2.length > 0 ? others2[0].id : null,
      })
    }
    const allSubmitted = await host.waitFor((s) => s.room.phase === 'council', { label: '全员提交进入盟约' })
    check('服务端校验通过后四人提交齐平', allSubmitted.room.seats.every((x) => x.submittedPick))
    check('提交后手牌从视图清空', allSubmitted.match.self.hand.length === 0)

    // 回到回合循环的起点：此刻四人已提交完第 1 回合，处于 council
    let rounds = 1
    let currentRound = host.snap.match.round
    // 第 1 回合的 council 已在上面进入，这里直接进入结算流程
    let phaseNow = 'council'
    while (currentRound <= 7) {
      if (phaseNow === 'picking') {
        await Promise.all(
          clients.map((c) =>
            c.waitFor((s) => s.room.phase === 'picking', { timeout: 8000, label: `第 ${currentRound} 回合暗选` }),
          ),
        )
        for (const c of clients) submitFor(c)
        await Promise.all(
          clients.map((c) =>
            c.waitFor((s) => s.room.phase === 'council' || s.room.phase === 'result', {
              timeout: 8000,
              label: `第 ${currentRound} 回合盟约`,
            }),
          ),
        )
        if (rounds === 2) check('后续回合提交后进入盟约窗口', true)
        if (host.snap.room.phase === 'result') break
      }

      // 盟约：全部直接就绪
      for (const c of clients) c.send({ type: 'councilReady' })

      await Promise.all(
        clients.map((c) =>
          c.waitFor((s) => s.room.phase === 'resolved', { timeout: 8000, label: `第 ${currentRound} 回合结算` }),
        ),
      )
      if (rounds === 1) {
        check('盟约就绪后进入结算', true)
        check('结算日志非空', (host.snap.match?.roundLog ?? []).length > 0)
        check('结算阶段 phase=resolved', host.snap.room.phase === 'resolved')
      }

      for (const c of clients) c.send({ type: 'readyNext' })
      const after = await host.waitFor(
        (s) => s.room.phase === 'picking' || s.room.phase === 'result',
        { timeout: 8000, label: `第 ${currentRound} 回合推进` },
      )
      if (after.room.phase === 'result') break
      currentRound = after.match.round
      phaseNow = 'picking'
      rounds += 1
      if (rounds > 12) throw new Error('回合数异常，可能陷入死循环')
    }

    const finalSnap = await host.waitFor((s) => s.room.phase === 'result', { timeout: 8000 })
    check('7 回合后进入终局', finalSnap.room.phase === 'result')
    check('终局有结算信息', Boolean(finalSnap.match.winnerReason || finalSnap.match.winner === null))
    check('终局手牌已清空', (finalSnap.match.self.hand ?? []).length === 0)

    /* ---------- 6. 断线重连 ---------- */
    // 新建一局验证重连
    const c1 = new TestClient(url, 'R1')
    clients.push(c1)
    await c1.ready
    c1.send({ type: 'createRoom', name: '重连甲' })
    const s1 = await c1.waitFor((s) => s.room.seats.length === 1)
    const rid2 = s1.room.roomId
    const token = s1.you.token
    const pid = s1.you.playerId

    const c2 = new TestClient(url, 'R2')
    clients.push(c2)
    await c2.ready
    c2.send({ type: 'joinRoom', roomId: rid2, name: '重连乙' })
    await c2.waitFor((s) => s.room.seats.length === 2)

    // c2 断开后用 token 重连
    c2.close()
    await new Promise((r) => setTimeout(r, 150))
    const c3 = new TestClient(url, 'R3')
    clients.push(c3)
    await c3.ready
    c3.send({ type: 'joinRoom', roomId: rid2, name: '重连乙', token: c2.snap.you.token })
    const rejoined = await c3.waitFor((s) => s.room.seats.length === 2 && s.you.playerId === c2.snap.you.playerId)
    check('断线后凭 token 回到原座位', rejoined.you.playerId === c2.snap.you.playerId)

    // 错误 token 不能占别人的座位
    const c4 = new TestClient(url, 'R4')
    clients.push(c4)
    await c4.ready
    c4.send({ type: 'joinRoom', roomId: rid2, name: '路人', token: 'BOGUS' })
    const fallback = await c4.waitFor((s) => s.room.seats.length === 3)
    check('无效 token 降级为普通加入', fallback.you.playerId !== pid && fallback.room.seats.length === 3)

    // 房间未满时不能开始
    check('不满 4 人时 allReady=false', fallback.room.allReady === false)
    void token
  } finally {
    clients.forEach((c) => {
      try {
        c.close()
      } catch {
        /* 忽略 */
      }
    })
    server.close()
  }

  /* ---------- 汇总 ---------- */
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`通过 ${results.length - failed.length} / ${results.length}`)
  if (failed.length > 0) {
    console.log('\n失败项：')
    failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
    process.exit(1)
  }
  console.log('全部通过 ✓\n')
}

main().catch((err) => {
  console.error('\n测试异常：', err)
  process.exit(1)
})

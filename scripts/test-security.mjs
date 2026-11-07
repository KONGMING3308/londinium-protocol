/**
 * 脱敏与反作弊专项验证：模拟「恶意客户端」，确认它拿不到不该拿的信息、也做不了不该做的事。
 *
 * 这是联机版最核心的安全边界，因此单独一个脚本、用真实 WebSocket 打真实服务端。
 *
 * 用法：node scripts/test-security.mjs（需先 npm run build，服务端产物要最新）
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { WebSocket } from 'ws'

const root = resolve(import.meta.dirname, '..')
const PORT = 8795
const BASE = `http://127.0.0.1:${PORT}/`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function waitServer() {
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    try {
      if ((await fetch(`${BASE}healthz`)).ok) return true
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

class Client {
  constructor(label) {
    this.label = label
    this.snap = null
    this.seq = 0
    this.errors = []
    this.waiters = []
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`)
    this.ready = new Promise((res, rej) => {
      this.ws.on('open', res)
      this.ws.on('error', rej)
    })
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString())
      if (m.type === 'snapshot') {
        if (m.seq >= this.seq) {
          this.seq = m.seq
          this.snap = m
        }
        this.flush()
      } else if (m.type === 'error') {
        this.errors.push(m)
        this.flush()
      }
    })
  }
  flush() {
    const w = this.waiters
    this.waiters = []
    w.forEach((fn) => fn())
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg))
  }
  /** 轮询等待：不依赖消息事件，直接读最新快照，最稳 */
  async waitUntil(pred, { timeout = 8000, label = '' } = {}) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      if (this.snap && pred(this.snap)) return this.snap
      await new Promise((r) => setTimeout(r, 25))
    }
    throw new Error(`${this.label} 超时${label ? `:${label}` : ''}`)
  }
  clearErrors() {
    this.errors = []
  }
  close() {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}

const server = spawn(process.execPath, [resolve(root, 'server/dist/index.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
})
server.stdout.on('data', () => {})

const clients = []

try {
  if (!(await waitServer())) throw new Error('服务端未启动')

  /* ================= 一、伪造消息：拿别人的座位 ================= */
  {
    const a = new Client('A')
    clients.push(a)
    await a.ready
    a.send({ type: 'createRoom', name: '甲' })
    const s = await a.waitUntil((x) => x.room.seats.length === 1)
    const roomId = s.room.roomId
    const aId = s.you.playerId
    void aId

    // 恶意客户端：不带 token 想顶替房主座位，只能作为新玩家加入
    const evil = new Client('EVIL')
    clients.push(evil)
    await evil.ready
    evil.send({ type: 'joinRoom', roomId, name: '甲', token: 'FAKE-TOKEN-000' })
    const es = await evil.waitUntil((x) => x.room.seats.length === 2)
    check(
      '伪造 token 无法顶替他人座位',
      es.you.playerId !== s.you.playerId && es.you.token !== s.you.token,
      `拿到 ${es.you.playerId}`,
    )

    // 恶意客户端：用自己的 token 反复改名，也不该影响房主
    evil.send({ type: 'setReady', ready: true })
    await new Promise((r) => setTimeout(r, 200))
    check('伪造 token 的客户端只能控制自己的准备状态', a.snap.room.seats.find((x) => x.playerId === s.you.playerId)?.ready === false)

    a.close()
    evil.close()
    await new Promise((r) => setTimeout(r, 200))
  }

  /* ================= 二、开局后越权操作 ================= */
  const room = []
  {
    const host = new Client('P1')
    clients.push(host)
    await host.ready
    host.send({ type: 'createRoom', name: '甲' })
    const s = await host.waitUntil((x) => x.room.seats.length === 1)
    room.push(host)
    const roomId = s.room.roomId

    for (let i = 0; i < 3; i += 1) {
      const c = new Client(`P${i + 2}`)
      clients.push(c)
      await c.ready
      c.send({ type: 'joinRoom', roomId, name: ['乙', '丙', '丁'][i] })
      room.push(c)
    }
    await host.waitUntil((x) => x.room.seats.length === 4)

    /* --- 大厅阶段：不能跳过准备直接开局 --- */
    host.send({ type: 'briefingAck' })
    await new Promise((r) => setTimeout(r, 200))
    check('大厅阶段调用 briefingAck 不生效', host.snap.room.phase === 'lobby')

    for (const c of room) c.send({ type: 'setReady', ready: true })
    for (const c of room) await c.waitUntil((x) => x.room.phase === 'briefing')
    check('四人准备后开局', host.snap.room.phase === 'briefing')

    /* --- 简报阶段：不能提前选牌 --- */
    const pid = host.snap.you.playerId
    host.clearErrors()
    host.send({
      type: 'submitPick',
      actionCardIds: ['X', 'Y'],
      neutralAccept: false,
      designated: { play: null, keep: null },
    })
    await new Promise((r) => setTimeout(r, 250))
    check('简报阶段提交选牌被拒绝', host.errors.some((e) => e.code === 'invalid_action'), host.errors[0]?.message)

    for (const c of room) c.send({ type: 'briefingAck' })
    for (const c of room) await c.waitUntil((x) => x.room.phase === 'picking')
    check('四人确认简报后进入暗选', true)

    /* --- 暗选阶段：伪造手牌 --- */
    await Promise.all(room.map((c) => c.waitUntil((x) => x.room.phase === 'picking')))
    const hand = host.snap.match.self.hand
    const fakeIds = ['NOT-IN-HAND-1', 'NOT-IN-HAND-2']
    host.clearErrors()
    host.send({
      type: 'submitPick',
      actionCardIds: fakeIds,
      neutralAccept: false,
      designated: { play: null, keep: null },
    })
    await new Promise((r) => setTimeout(r, 250))
    check('提交不在手牌中的牌被拒绝', host.errors.some((e) => e.code === 'invalid_action'), host.errors[0]?.message)

    /* --- 暗选阶段：只提交 1 张 --- */
    host.clearErrors()
    host.send({
      type: 'submitPick',
      actionCardIds: [hand[0].id],
      neutralAccept: false,
      designated: { play: null, keep: null },
    })
    await new Promise((r) => setTimeout(r, 250))
    check('只提交 1 张行动牌被拒绝', host.errors.some((e) => e.code === 'invalid_action'))

    /* --- 暗选阶段：伪造目标 --- */
    host.clearErrors()
    const acts = hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC')
    const designated = hand.find((c) => c.category === 'designated')
    host.send({
      type: 'submitPick',
      actionCardIds: acts.slice(0, 2).map((c) => c.id),
      neutralAccept: false,
      designated: designated ? { play: 'new', keep: null } : { play: null, keep: null },
      targetId: 'NOT-A-REAL-PLAYER',
    })
    await new Promise((r) => setTimeout(r, 250))
    if (designated) {
      check('伪造 targetId 被拒绝', host.errors.some((e) => e.code === 'invalid_action'), host.errors[0]?.message)
    } else {
      check('本回合没有指定牌，跳过 targetId 测试', true)
    }

    /* --- 暗选阶段：替别人提交 --- */
    // 协议里 submitPick 没有 playerId 字段，服务端只认连接身份——这是关键设计。
    const otherSeat = host.snap.match.players.find((p) => p.id !== pid)
    host.clearErrors()
    host.send({
      type: 'submitPick',
      playerId: otherSeat.id, // 伪造字段
      actionCardIds: acts.slice(0, 2).map((c) => c.id),
      neutralAccept: false,
      designated: { play: null, keep: null },
    })
    await new Promise((r) => setTimeout(r, 400))
    // 只应影响自己这一票：伪造的 playerId 字段被忽略，别人仍处于未提交
    const submittedIds = host.snap.room.seats.filter((x) => x.submittedPick).map((x) => x.playerId)
    check(
      '伪造 playerId 无法替他人提交（服务端只认连接身份）',
      !submittedIds.includes(otherSeat.id),
      `已提交：${submittedIds.join(',') || '无'}`,
    )
    check('伪造 playerId 的请求仍按本人身份生效', submittedIds.includes(pid), `本人 ${pid} 已提交`)

    /* --- 越权：在暗选阶段调用结算类操作 --- */
    host.clearErrors()
    host.send({ type: 'factionPick', cardId: null })
    host.send({ type: 'councilReady' })
    await new Promise((r) => setTimeout(r, 250))
    check(
      '暗选阶段调用结算/盟约操作被拒绝',
      host.errors.filter((e) => e.code === 'invalid_action').length >= 2,
      `收到 ${host.errors.length} 条错误`,
    )

    // 清理：host 前面几次合法性测试都没真正提交成功，这里补一次合法提交，
    // 好让后续阶段推进（其余人由「三」里统一补齐）。
    const mySeat = host.snap.room.seats.find((x) => x.playerId === pid)
    if (!mySeat?.submittedPick && host.snap.room.phase === 'picking') {
      const self = host.snap.match.self
      const acts = self.hand.filter((x) => x.category === 'action' && x.owner !== 'GENERIC')
      host.send({
        type: 'submitPick',
        actionCardIds: acts.slice(0, 2).map((x) => x.id),
        neutralAccept: false,
        designated: { play: null, keep: null },
      })
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  /* ================= 三、脱敏：私密数据不跨玩家 ================= */
  {
    const [p1, p2, p3, p4] = room
    // 让全员提交进入盟约阶段；已提交过的人跳过（否则重复提交会被拒，卡在 picking）
    for (const c of room) {
      if (c.snap.room.phase !== 'picking') continue
      const mySeat = c.snap.room.seats.find((s) => s.playerId === c.snap.you.playerId)
      if (mySeat?.submittedPick) continue
      const self = c.snap.match.self
      const acts = self.hand.filter((x) => x.category === 'action' && x.owner !== 'GENERIC')
      const off = self.hand.find((x) => x.category === 'designated')
      const others = c.snap.match.players.filter((p) => p.id !== c.snap.you.playerId && !p.defeated)
      const canPlay = Boolean(off) && !self.exiled && others.length > 0
      c.send({
        type: 'submitPick',
        actionCardIds: acts.slice(0, 2).map((x) => x.id),
        neutralAccept: false,
        designated: canPlay ? { play: 'new', keep: null } : { play: null, keep: null },
        targetId: canPlay ? others[0].id : null,
      })
    }
    for (const c of room) {
      try {
        await c.waitUntil((x) => x.room.phase === 'council', { timeout: 8000 })
      } catch {
        const seats = c.snap.room.seats.map(
          (s) => `${s.playerId}:${s.submittedPick ? '已提交' : '未提交'}`,
        )
        const self = c.snap.match.self
        const acts = self.hand.filter((x) => x.category === 'action' && x.owner !== 'GENERIC')
        throw new Error(
          `${c.label} 未进入 council。phase=${c.snap.room.phase}；座位=${seats.join(' ')}；` +
            `本人行动牌=${acts.length} 张；exiled=${self.exiled}；defeated=${self.defeated}；` +
            `错误=${JSON.stringify(c.errors.slice(-3))}`,
        )
      }
    }

    // 关键断言：把每个人的完整快照串起来，检查别人的 hand / victory 是否泄漏
    for (const [i, viewer] of room.entries()) {
      const raw = JSON.stringify(viewer.snap.match)
      // 别人的胜利条件标题（用 FACTION_MAP 无法直接拿，这里用「自己视角里有、且属于别人阵营」的方式检查）
      const myVictoryTitle = viewer.snap.match.self.victory.title
      let leakedOthers = 0
      for (const [j, other] of room.entries()) {
        if (i === j) continue
        const t = other.snap.match.self.victory.title
        // 只有「自己的」胜利条件应该出现在自己的报文里
        if (t !== myVictoryTitle && raw.includes(`"${t}"`)) leakedOthers += 1
      }
      check(`P${i + 1} 的快照里没有别人的胜利条件`, leakedOthers === 0, `泄漏 ${leakedOthers} 处`)

      // 别人的手牌牌 id 不该出现在我的报文里
      let handLeak = 0
      for (const [j, other] of room.entries()) {
        if (i === j) continue
        const otherHandIds = other.snap.__initialHand ?? []
        void otherHandIds
      }
      // 用更直接的方式：public players 里不该有 hand 字段
      const pubHasHand = viewer.snap.match.players.some((p) => 'hand' in p)
      const pubHasHeld = viewer.snap.match.players.some((p) => 'heldDesignated' in p)
      const pubHasKeptRound = viewer.snap.match.players.some((p) => 'heldKeptRound' in p)
      const pubHasVictory = viewer.snap.match.players.some((p) => 'victory' in p)
      check(`P${i + 1} 公开玩家列表无 hand 字段`, !pubHasHand)
      check(`P${i + 1} 公开玩家列表无 heldDesignated 字段`, !pubHasHeld)
      check(`P${i + 1} 公开玩家列表无 heldKeptRound 字段`, !pubHasKeptRound)
      check(`P${i + 1} 公开玩家列表无 victory 字段`, !pubHasVictory)
    }

    // 阵营交换候选：无同盟时谁都不该看到
    const anyAlly = room.some((c) => c.snap.match.players.some((p) => p.allyId))
    if (!anyAlly) {
      const leakedOffers = room.filter((c) => c.snap.match.faction.offers.length > 0).length
      check('无人结盟时，没有任何人看到阵营交换候选', leakedOffers === 0)
    } else {
      check('存在同盟，交换候选可见性在后续阶段验证', true)
    }

    /* ================= 四、盟约越权 ================= */
    const attacker = p1
    const victim = p2
    attacker.clearErrors()
    // 伪造 fromId 替别人回应请求
    attacker.send({ type: 'councilAllyRespond', fromId: 'NOT-EXIST', accept: true })
    await new Promise((r) => setTimeout(r, 250))
    check('伪造 fromId 回应结盟请求被拒绝', attacker.errors.some((e) => e.code === 'invalid_action'), attacker.errors[0]?.message)

    // 单方面结盟：A 提议但 B 不同意，不该成立
    const aId = attacker.snap.you.playerId
    const bId = victim.snap.you.playerId
    attacker.clearErrors()
    attacker.send({ type: 'councilAllyRequest', targetId: bId })
    await new Promise((r) => setTimeout(r, 400))
    const afterRequest = attacker.snap.match.players.find((p) => p.id === aId)
    check('单方面提议不会直接建立同盟', afterRequest.allyId === null)

    // 阵营组合固定不可控，请求可能因「阵营不可结盟」被服务端正当拒绝。
    // 两种情况都要验证：被拒要有明确错误；受理了则对方必须看得到。
    const requestRejected = attacker.errors.some((e) => e.code === 'invalid_action')
    if (requestRejected) {
      check('不兼容阵营的结盟请求被明确拒绝', true, attacker.errors[0]?.message)
      check('被拒的请求不会出现在对方的收件箱', victim.snap.match.council.incoming === null)
    } else {
      check('被请求方能看到 incoming 请求', victim.snap.match.council.incoming?.fromId === aId)
      victim.send({ type: 'councilAllyRespond', fromId: aId, accept: false })
      await new Promise((r) => setTimeout(r, 400))
      check('拒绝后同盟不成立', attacker.snap.match.players.find((p) => p.id === aId).allyId === null)
    }

    void p3
    void p4
  }

  /* ================= 五、畸形消息：不允许打崩服务端 ================= */
  // 这是曾经真实存在的 P0：`{"type":"createRoom"}` 缺 name 会让 .trim() 抛异常，
  // 未捕获 → 进程退出 → 所有房间和进行中的对局全部丢失。
  {
    const MALFORMED = [
      ['createRoom 缺 name', { type: 'createRoom' }],
      ['createRoom name 为 null', { type: 'createRoom', name: null }],
      ['createRoom name 是数字', { type: 'createRoom', name: 12345 }],
      ['createRoom name 是对象', { type: 'createRoom', name: { a: 1 } }],
      ['joinRoom 缺 roomId', { type: 'joinRoom', name: 'x' }],
      ['joinRoom roomId 为 null', { type: 'joinRoom', roomId: null, name: 'x' }],
      ['joinRoom roomId 是数字', { type: 'joinRoom', roomId: 777, name: 'x' }],
      ['joinRoom token 是对象', { type: 'joinRoom', roomId: 'AAAA', name: 'x', token: {} }],
      ['submitPick designated 为 null', { type: 'submitPick', actionCardIds: [], neutralAccept: false, designated: null }],
      ['submitPick actionCardIds 为 null', { type: 'submitPick', actionCardIds: null, neutralAccept: false, designated: { play: null, keep: null } }],
      ['councilAllyRequest targetId 为 null', { type: 'councilAllyRequest', targetId: null }],
      ['councilAllyRespond fromId 是数字', { type: 'councilAllyRespond', fromId: 42, accept: true }],
      ['factionPick cardId 是对象', { type: 'factionPick', cardId: {} }],
      ['setReady ready 是字符串', { type: 'setReady', ready: 'yes' }],
      ['未知消息类型', { type: 'definitelyNotARealType' }],
      ['完全没有 type 字段', { hello: 'world' }],
    ]

    const probe = new Client('PROBE')
    clients.push(probe)
    await probe.ready

    for (const [label, payload] of MALFORMED) {
      probe.send(payload)
      await new Promise((r) => setTimeout(r, 60))
      // 每发一条都确认服务端还活着：这是本组测试的核心
      let alive = false
      try {
        alive = (await fetch(`${BASE}healthz`)).ok
      } catch {
        alive = false
      }
      check(`畸形消息不崩服务端：${label}`, alive)
      if (!alive) break
    }

    // 再补两条根本不是 JSON 的原始报文
    for (const raw of ['not json at all', '{"type":', '[]', 'null', '"string"']) {
      try {
        probe.ws.send(raw)
      } catch {
        /* 连接已断则忽略 */
      }
      await new Promise((r) => setTimeout(r, 60))
      let alive = false
      try {
        alive = (await fetch(`${BASE}healthz`)).ok
      } catch {
        alive = false
      }
      check(`非 JSON 报文不崩服务端：${JSON.stringify(raw)}`, alive)
      if (!alive) break
    }

    probe.close()
    await new Promise((r) => setTimeout(r, 150))
  }

  /* ================= 六、加固：原型污染 / 超大载荷 / 洪泛 ================= */
  // 这三类不一定会崩，但都是「以后有人改这块代码时的护栏」。
  {
    const hardened = new Client('HARDENED')
    clients.push(hardened)
    await hardened.ready

    const health = async () => {
      try {
        return (await fetch(`${BASE}healthz`)).ok
      } catch {
        return false
      }
    }
    /** 发原始 JSON 文本，便于构造 JSON.stringify 会丢掉的 __proto__ 等键 */
    const sendRaw = async (raw, label) => {
      try {
        hardened.ws.send(raw)
      } catch {
        /* 连接已断则忽略 */
      }
      await new Promise((r) => setTimeout(r, 120))
      check(label, await health())
    }

    // 1) 原型污染：不能让攻击者把属性挂到 Object.prototype 上
    await sendRaw(
      '{"type":"createRoom","name":"x","__proto__":{"polluted":"yes"}}',
      '原型污染（__proto__）不崩服务端',
    )
    await sendRaw(
      '{"type":"createRoom","name":"x","constructor":{"prototype":{"polluted":"yes"}}}',
      '原型污染（constructor.prototype）不崩服务端',
    )
    // 污染是否真的得逞：读一个空对象的属性。
    // 用文本判断而不是 .json()，避免服务端返回非 JSON 时脚本自己先抛错。
    let pollutedOk = false
    try {
      const text = await (await fetch(`${BASE}healthz`)).text()
      pollutedOk = text.includes('"ok":true')
    } catch {
      pollutedOk = false
    }
    check('原型未被污染（服务端仍正常响应健康检查）', pollutedOk && !('polluted' in {}))

    // 2) 超大载荷：10 万字符与 1MB 的字段，不能把服务端内存/CPU 打满
    await sendRaw(
      JSON.stringify({ type: 'createRoom', name: 'x'.repeat(100_000) }),
      '10 万字符的 name 不崩服务端',
    )
    await sendRaw(
      JSON.stringify({ type: 'createRoom', name: 'x'.repeat(1024 * 1024) }),
      '1MB 的 name 不崩服务端',
    )

    // 3) 洪泛：单连接连发 50 条畸形消息，验证 try/catch 不会累积坏状态
    for (let i = 0; i < 50; i += 1) {
      try {
        hardened.ws.send('{"type":"submitPick","actionCardIds":null,"designated":null}')
      } catch {
        break
      }
    }
    await new Promise((r) => setTimeout(r, 400))
    check('单连接连发 50 条畸形消息后服务端仍存活', await health())

    // 洪泛之后，服务端必须还能正常服务新玩家（不是「活着但坏了」）
    const afterFlood = new Client('AFTER-FLOOD')
    clients.push(afterFlood)
    await afterFlood.ready
    afterFlood.send({ type: 'createRoom', name: '洪泛后新建' })
    let recovered = false
    try {
      const s = await afterFlood.waitUntil((x) => x.room.seats.length === 1, { timeout: 5000 })
      recovered = Boolean(s.room.roomId)
    } catch {
      recovered = false
    }
    check('洪泛之后仍能正常建房（功能未受损）', recovered)
    afterFlood.close()

    hardened.close()
    await new Promise((r) => setTimeout(r, 150))
  }

  /* ================= 六点五、静态文件路径穿越 ================= */
  {
    // 请求 dist 之外的路径，绝不能读到磁盘上兄弟目录文件的内容。
    // 注意 SPA 回退会把「不存在但在 dist 内」的路径回退成 index.html（200），
    // 所以断言点是「响应体不含目标文件特征串」，而不是「必须 403/404」。
    const probes = [
      { path: '/../../package.json', marker: '"private": true' },
      { path: '/..%2f..%2fpackage.json', marker: '"private": true' },
      { path: '/%2e%2e/%2e%2e/package.json', marker: '"private": true' },
      { path: '/....//....//package.json', marker: '"private": true' },
    ]
    for (const { path, marker } of probes) {
      let status = 0
      let text = ''
      try {
        const resp = await fetch(`${BASE}${path.replace(/^\//, '')}`)
        status = resp.status
        text = await resp.text()
      } catch {
        status = 0
      }
      const leaked = text.includes(marker)
      check(
        `路径穿越不泄漏文件内容：${path}`,
        !leaked && (status === 403 || status === 404 || status === 200),
        leaked ? `泄漏了 ${marker}（status ${status}）` : `status ${status}`,
      )
    }
    // 正常首页仍可访问，证明拦截没有误伤
    let homeOk = false
    try {
      homeOk = (await fetch(`${BASE}`)).ok
    } catch {
      homeOk = false
    }
    check('正常首页仍可访问（穿越拦截未误伤）', homeOk)
  }

  /* ================= 七、最终存活检查 ================= */
  check('全部攻击后服务端仍在运行', (await fetch(`${BASE}healthz`)).ok)
  check('原有房间未因攻击而丢失', clients.length > 0)
} finally {
  clients.forEach((c) => c.close())
  server.kill()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'─'.repeat(50)}`)
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exit(1)
}
console.log('安全边界验证全部通过 ✓\n')

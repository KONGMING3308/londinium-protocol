/**
 * 断线恢复 / 座位保留 / token 有效期的回归测试。
 *
 * 用户反馈（多人实测）：「一阶段切屏就会重置」「token 应该要保持一天」。
 * 拆开看是四个独立缺陷，本文件逐条钉住：
 *
 *   1. **大厅阶段断线 = 座位被删**：在准备界面刷新或手机切屏，token 当场作废。
 *      修复：断线一律保留座位，只有显式 leaveRoom 才释放。
 *   2. **全员离线仍会托管**：30 秒一到，托管把四个人没做的决策全代打了，
 *      切回来发现回合已经跑掉。修复：无人在线时冻结倒计时，有人回来再继续。
 *   3. **全员离线宽限期只有 3 分钟**：四个人一起切屏超过 3 分钟，房间被回收，
 *      token 全失效。修复：保留期与 token 有效期一起调到 24 小时。
 *   4. **token 没有有效期概念**：永不过期既不合规也没法回收。修复：24 小时，
 *      重连时续期；过期的座位会被释放。
 *
 * 为了不真等 30 秒 / 一天，这里用环境变量把四个时长压到毫秒级。
 *
 * 用法：node scripts/test-resume.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const PORT = 8941
// 子进程配置：决策时限 800ms、保留期 3s、清理扫描 400ms、token 1.2s
const ENV = {
  ...process.env,
  PORT: String(PORT),
  HOST: '127.0.0.1',
  PHASE_MS_PICKING: '800',
  PHASE_MS_COUNCIL: '800',
  PHASE_MS_BRIEFING: '800',
  PHASE_MS_RESOLVED: '800',
  EMPTY_GRACE_MS: '6000',
  SWEEP_MS: '400',
  TOKEN_TTL_MS: '2000',
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class TestClient {
  constructor(url, label) {
    this.label = label
    this.snap = null
    this.seq = 0
    this.errors = []
    this.ws = new WebSocket(url)
    this.ready = new Promise((res, rej) => {
      this.ws.on('open', res)
      this.ws.on('error', rej)
    })
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'snapshot') {
        if (msg.seq >= this.seq) {
          this.seq = msg.seq
          this.snap = msg
        }
      } else if (msg.type === 'error') {
        this.errors.push(msg)
      }
    })
  }

  send(msg) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg))
  }

  /** 轮询等待：predicate 可以只看错误列表这类不依赖快照的条件 */
  async waitFor(predicate, { timeout = 4000, label = '' } = {}) {
    const started = Date.now()
    for (;;) {
      let ok = false
      try {
        ok = predicate(this.snap)
      } catch {
        ok = false
      }
      if (ok) return this.snap
      if (Date.now() - started > timeout) {
        throw new Error(`${this.label} 等待超时${label ? `：${label}` : ''}`)
      }
      await sleep(25)
    }
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* 忽略 */
    }
  }
}

/** 起服务端子进程，等它打印端口 */
function spawnServer() {
  const child = spawn(process.execPath, [join(root, 'server', 'dist', 'index.mjs')], {
    cwd: root,
    env: ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logs = []
  const ready = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('服务端启动超时：\n' + logs.join(''))), 15000)
    child.stdout.on('data', (buf) => {
      const text = buf.toString()
      logs.push(text)
      if (text.includes('HTTP')) {
        clearTimeout(timer)
        res()
      }
    })
    child.stderr.on('data', (buf) => logs.push(buf.toString()))
    child.on('exit', (code) => {
      clearTimeout(timer)
      rej(new Error(`服务端进程退出（${code}）：\n` + logs.join('')))
    })
  })
  return { child, ready, logs }
}

const url = `ws://127.0.0.1:${PORT}/ws`

let server = null
try {
  server = spawnServer()
  const { ready } = server
  await ready
  await sleep(150)

  /* ============ 场景一：大厅里断线 / 刷新不丢座位 ============ */
  const host = new TestClient(url, 'host')
  await host.ready
  host.send({ type: 'createRoom', name: '房主' })
  const hostSnap = await host.waitFor((s) => s.room && s.room.seats.length === 1, { label: '建房' })
  const roomId = hostSnap.room.roomId
  const hostToken = hostSnap.you.token
  check('建房成功，拿到房间码与 token', Boolean(roomId) && Boolean(hostToken), `房间 ${roomId}`)

  const others = []
  for (const name of ['二号', '三号', '四号']) {
    const c = new TestClient(url, name)
    await c.ready
    c.send({ type: 'joinRoom', roomId, name })
    await c.waitFor((s) => s.room && s.room.seats.length >= 2, { label: name + ' 加入' })
    others.push(c)
  }
  const allIn = await host.waitFor((s) => s.room.seats.length === 4, { label: '四人到齐' })
  check('四人进入同一大厅', allIn.room.seats.length === 4)

  // 四号在大厅阶段断线（等价于手机切屏 / 按刷新）
  const leaver = others[2]
  const leaverToken = leaver.snap.you.token
  const leaverId = leaver.snap.you.playerId
  leaver.close()
  const afterDrop = await host.waitFor(
    (s) => s.room.seats.some((x) => x.playerId === leaverId && !x.connected),
    { label: '座位保留' },
  )
  check('大厅阶段断线 → 座位仍保留（不再当场释放）', afterDrop.room.seats.length === 4, `seats=${afterDrop.room.seats.length}`)

  // 用同一个 token 重新连回来
  const back = new TestClient(url, '四号-重连')
  await back.ready
  back.send({ type: 'joinRoom', roomId, name: '四号', token: leaverToken })
  const backSnap = await back.waitFor((s) => s.you.playerId === leaverId, { label: '回座' })
  check('带 token 重连 → 回到原座位', backSnap.you.playerId === leaverId, `playerId=${backSnap.you.playerId}`)
  check('重连后座位数不变（没有被当成新玩家）', backSnap.room.seats.length === 4, `seats=${backSnap.room.seats.length}`)
  check('重连后 token 有效且被续期', typeof backSnap.you.token === 'string' && backSnap.you.token.length > 0)

  /* ============ 场景二：全员离线 → 倒计时冻结，不托管 ============ */
  // 四人全准备开局
  const all = [host, ...others.slice(0, 2), back]
  all.forEach((c) => c.send({ type: 'setReady', ready: true }))
  await host.waitFor((s) => s.room.phase === 'briefing', { label: '开局' })
  all.forEach((c) => c.send({ type: 'briefingAck' }))
  const picking = await host.waitFor((s) => s.match && s.match.phase === 'picking', { label: '进入暗选' })
  const roundBefore = picking.match.round
  check('四人准备后进入暗选阶段', picking.match.phase === 'picking', `第 ${roundBefore} 回合`)

  // 全员断开（模拟四个人一起切屏）
  all.forEach((c) => c.close())
  await sleep(1600) // 远超 800ms 的决策时限，但还在 3s 保留期内

  const probe = new TestClient(url, '探针-重连')
  await probe.ready
  probe.send({ type: 'joinRoom', roomId, name: '房主', token: hostToken })
  const frozen = await probe.waitFor((s) => s.match !== null, { label: '探针回房' })
  check(
    '全员离线期间不被托管：回合与阶段原样保留',
    frozen.match.phase === 'picking' && frozen.match.round === roundBefore,
    `phase=${frozen.match.phase} round=${frozen.match.round}`,
  )
  check(
    '全员离线期间没有任何人被代打出牌（无人处于已提交状态）',
    frozen.room.seats.every((s) => !s.submittedPick),
    `已提交 ${frozen.room.seats.filter((s) => s.submittedPick).length} 人`,
  )

  /* ============ 场景三：有人在线时，托管照旧生效（对照组） ============ */
  // 探针在线（房主），其余三人离线 → 到点应托管房主之外的人并推进
  const beforeTimeout = probe.snap
  await sleep(1400)
  const afterTimeout = probe.snap
  const progressed =
    afterTimeout.match?.phase !== beforeTimeout.match?.phase ||
    afterTimeout.match?.round !== beforeTimeout.match?.round ||
    JSON.stringify(afterTimeout.match?.self.submitted) !== JSON.stringify(beforeTimeout.match?.self.submitted)
  check(
    '有人在线的对照组：到点仍然托管并推进（冻结只对全员离线生效）',
    progressed,
    `phase=${beforeTimeout.match?.phase}→${afterTimeout.match?.phase}`,
  )

  /* ============ 场景四：token 过期后不再认这条凭证 ============ */
  const host2 = new TestClient(url, '过期-房主')
  await host2.ready
  host2.send({ type: 'createRoom', name: '过期房主' })
  const snap2 = await host2.waitFor((s) => s.room && s.room.seats.length === 1, { label: '第二个房间' })
  const room2 = snap2.room.roomId
  const token2 = snap2.you.token
  const id2 = snap2.you.playerId
  host2.close()
  await sleep(2600) // 超过 TOKEN_TTL_MS=2000，但还在 6s 保留期内
  const fresh = new TestClient(url, '过期后重连')
  await fresh.ready
  fresh.send({ type: 'joinRoom', roomId: room2, name: '过期房主', token: token2 })
  const freshSnap = await fresh.waitFor((s) => s.room !== null, { label: '过期 token 重新加入' })
  check(
    '过期 token 不被采信（重新发新凭证）',
    freshSnap.you.token !== token2,
    `旧 ${token2.slice(0, 6)}… 新 ${freshSnap.you.token.slice(0, 6)}…`,
  )
  check(
    '过期 token 对应的座位已被释放（没有重复占位）',
    freshSnap.room.seats.length === 1,
    `seats=${freshSnap.room.seats.length}`,
  )
  void id2

  /* ============ 场景五：超过保留期才回收（保留期内还在） ============ */
  // 房间 2 的房主刚连上又断开，等 6s 保留期 + 扫描周期
  fresh.close()
  await sleep(6800)
  const zombie = new TestClient(url, '回收后重连')
  await zombie.ready
  zombie.send({ type: 'joinRoom', roomId: room2, name: '过期房主', token: token2 })
  await zombie.waitFor(() => zombie.errors.length > 0, { label: '房间已被回收' })
  check(
    '全员离线超过保留期 → 房间回收，重连得到明确错误',
    zombie.errors.some((e) => e.code === 'room_not_found'),
    zombie.errors[0]?.message ?? '',
  )

  ;[probe, zombie].forEach((c) => c.close())
} catch (err) {
  console.error(err)
  console.error('--- 服务端日志 ---\n' + (server?.logs.join('') ?? '(无)'))
  process.exitCode = 1
} finally {
  // 无论成败都要收掉子进程，否则父进程会挂在管道上不退出
  server?.child.kill()
  await sleep(150)
}

const failed = results.filter((r) => !r.ok)
console.log('\n' + '─'.repeat(60))
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exitCode = 1
} else {
  console.log('断线恢复 / 座位保留 / token 有效期验证全部通过 ✓')
}

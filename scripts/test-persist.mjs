/**
 * 房间落盘：服务端重启后对局必须还在。
 *
 * 用户诉求：座位保留 24 小时、token 保持一天——这些在「进程重启」面前都没用。
 * 一次 `npm start`、一次部署更新、一次断电，内存里的房间就全没了。
 *
 * 本脚本验证的正是最狠的那条路径：**直接 SIGKILL 杀掉服务端进程**（不给它
 * 任何 flush 的机会，等价于断电），再起一个新的，看玩家能不能凭 token 回到原座位，
 * 且回合、阶段、手牌与杀掉前完全一致。
 *
 * 用法：node scripts/test-persist.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const PORT = 8971
const dataDir = mkdtempSync(join(tmpdir(), 'londinium-persist-'))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
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

  async waitFor(predicate, { timeout = 6000, label = '' } = {}) {
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
      await sleep(30)
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

/** 起服务端子进程（落盘目录固定为本次测试的临时目录） */
function spawnServer() {
  const child = spawn(process.execPath, [join(root, 'server', 'dist', 'index.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      SWEEP_MS: '400',
      PHASE_MS_PICKING: '60000',
    },
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
let current = null

try {
  /* ================= 第一次启动：开一局打到暗选 ================= */
  current = spawnServer()
  await current.ready
  await sleep(200)

  const clients = []
  const names = ['甲', '乙', '丙', '丁']
  const host = new TestClient(url, '房主')
  await host.ready
  host.send({ type: 'createRoom', name: names[0] })
  const hostSnap = await host.waitFor((s) => s.room && s.room.seats.length === 1, { label: '建房' })
  const roomId = hostSnap.room.roomId
  const hostToken = hostSnap.you.token
  const hostId = hostSnap.you.playerId
  clients.push(host)

  for (let i = 1; i < 4; i += 1) {
    const c = new TestClient(url, names[i])
    await c.ready
    c.send({ type: 'joinRoom', roomId, name: names[i] })
    await c.waitFor((s) => s.room && s.room.seats.length === i + 1, { label: names[i] })
    clients.push(c)
  }
  check('四人进入同一大厅', (await host.waitFor((s) => s.room.seats.length === 4)).room.seats.length === 4)

  clients.forEach((c) => c.send({ type: 'setReady', ready: true }))
  await host.waitFor((s) => s.room.phase === 'briefing', { label: '开局' })
  clients.forEach((c) => c.send({ type: 'briefingAck' }))
  const picking = await host.waitFor((s) => s.match && s.match.phase === 'picking', { label: '暗选' })

  const roundBefore = picking.match.round
  const handBefore = picking.match.self.hand.map((c) => c.id).sort()
  check('打到暗选阶段（有手牌）', handBefore.length > 0, `第 ${roundBefore} 回合，${handBefore.length} 张手牌`)

  // 二号不提交：用他来验证「恢复后手牌原样还在」（已提交的人手牌会被打掉，不适合对比）
  const p2Snap = await clients[1].waitFor((s) => s.match && s.match.phase === 'picking', { label: '二号暗选' })
  const p2Token = p2Snap.you.token
  const p2Id = p2Snap.you.playerId
  const p2HandBefore = p2Snap.match.self.hand.map((c) => c.id).sort()

  // 让房主提交一次选牌，验证「已提交状态」也能落盘
  const me = picking.match.self
  const actions = me.hand.filter((c) => c.category === 'action' && c.owner !== 'GENERIC').slice(0, 2)
  const offered = me.hand.find((c) => c.category === 'designated')
  const others = picking.match.players.filter((p) => p.id !== hostId && !p.defeated)
  const designated =
    offered && others.length > 0 ? { play: 'new', keep: null } : { play: null, keep: offered ? 'new' : null }
  if (actions.length === 2) {
    host.send({
      type: 'submitPick',
      actionCardIds: actions.map((c) => c.id),
      neutralAccept: false,
      designated,
      targetId: designated.play ? others[0].id : null,
    })
    await sleep(400)
  }
  const submittedBefore = Boolean((await host.waitFor((s) => s.match)).room.seats.find((x) => x.playerId === hostId)?.submittedPick)
  check('房主已提交本回合选牌', submittedBefore, submittedBefore ? '已提交' : '未提交')

  // 等节流写盘（默认 800ms）
  await sleep(1500)
  const file = join(dataDir, 'rooms.json')
  check('落盘文件已经生成', existsSync(file), file)
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  check('落盘里能读到这个房间', Array.isArray(saved.rooms) && saved.rooms.some((r) => r.roomId === roomId), `共 ${saved.rooms?.length ?? 0} 间`)
  const savedRoom = saved.rooms.find((r) => r.roomId === roomId)
  const savedP2Hand = (savedRoom?.state?.hands?.[p2Id] ?? []).map((c) => c.id).sort()
  check(
    '落盘里的手牌与内存一致（二号）',
    JSON.stringify(savedP2Hand) === JSON.stringify(p2HandBefore),
    `${savedP2Hand.length} 张`,
  )

  /* ================= 最狠的一刀：SIGKILL（等价断电） ================= */
  clients.forEach((c) => c.close())
  current.child.kill('SIGKILL')
  await sleep(800)
  console.log('  … 服务端已被 SIGKILL 杀掉（没有任何优雅退出的机会）')

  /* ================= 第二次启动：从磁盘读回 ================= */
  current = spawnServer()
  await current.ready
  await sleep(300)

  const back = new TestClient(url, '重启后重连')
  await back.ready
  back.send({ type: 'joinRoom', roomId, name: names[0], token: hostToken })
  const revived = await back.waitFor((s) => s.room !== null || s.errors.length > 0, { label: '重连' })

  check('重启后房间还在（没有被当成「房间不存在」）', revived && !back.errors.some((e) => e.code === 'room_not_found'), back.errors[0]?.message ?? '房间已恢复')
  check('重连回到原座位', revived?.you?.playerId === hostId, `playerId=${revived?.you?.playerId}`)
  check('四个人都在座位上', revived?.room?.seats?.length === 4, `seats=${revived?.room?.seats?.length}`)
  check(
    '对局进度原样恢复（回合 / 阶段）',
    revived?.match?.phase === 'picking' && revived?.match?.round === roundBefore,
    `phase=${revived?.match?.phase} round=${revived?.match?.round}`,
  )
  const handAfter = (revived?.match?.self?.hand ?? []).map((c) => c.id).sort()
  void handAfter
  check(
    '重启前的提交状态也保住了',
    Boolean(revived?.room?.seats?.find((x) => x.playerId === hostId)?.submittedPick),
    '房主仍是「已提交」',
  )
  check('其余三人恢复后处于离线（等他们自己连回来）', (revived?.room?.seats ?? []).filter((s) => s.connected).length === 1, `在线 ${(revived?.room?.seats ?? []).filter((s) => s.connected).length} 人`)

  // 二号（没提交过）连回来，验证手牌是原样恢复的
  const back2 = new TestClient(url, '重启后二号重连')
  await back2.ready
  back2.send({ type: 'joinRoom', roomId, name: names[1], token: p2Token })
  const revived2 = await back2.waitFor((s) => s.match !== null || s.errors.length > 0, { label: '二号重连' })
  const p2HandAfter = (revived2?.match?.self?.hand ?? []).map((c) => c.id).sort()
  check(
    '未提交玩家的手牌一张不差',
    JSON.stringify(p2HandAfter) === JSON.stringify(p2HandBefore),
    `${p2HandAfter.length} 张`,
  )
  check('二号也回到自己的座位', revived2?.you?.playerId === p2Id, `playerId=${revived2?.you?.playerId}`)
  check(
    '两人都连回来后，房间里有两个在线玩家',
    (revived2?.room?.seats ?? []).filter((s) => s.connected).length === 2,
    `在线 ${(revived2?.room?.seats ?? []).filter((s) => s.connected).length} 人`,
  )

  back.close()
  back2.close()
} catch (err) {
  console.error(err)
  console.error('--- 服务端日志 ---\n' + (current?.logs.join('') ?? '(无)'))
  process.exitCode = 1
} finally {
  current?.child.kill('SIGKILL')
  await sleep(200)
  rmSync(dataDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log('\n' + '─'.repeat(60))
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exitCode = 1
} else {
  console.log('房间落盘与重启恢复验证全部通过 ✓')
}

/**
 * 发布包验收测试：模拟「把包传到服务器上」的真实场景。
 *
 * 这个测试的意义在于排除一切「本机碰巧能跑」的可能：
 *   - 把 release 目录复制到一个全新的临时目录（模拟上传到服务器）
 *   - 该目录里**没有任何 node_modules**（服务器上不会跑 npm install）
 *   - 只用 node server.mjs 启动
 *   - 然后真的开四个 WebSocket 客户端走完「建房→加入→准备→开局→打完」
 *
 * 如果这个测试通过，说明发布包确实可以独立部署。
 *
 * 用法：node scripts/test-release.mjs
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const RELEASE = resolve(root, 'release', `londinium-protocol-v${pkg.version}`)

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function waitOk(url, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

/* ---------- 0. 发布包存在性 ---------- */
if (!existsSync(RELEASE)) {
  console.error('未找到发布包，请先运行 node scripts/build-release.mjs')
  process.exit(1)
}

/* ---------- 1. 模拟「上传到服务器」：复制到干净临时目录 ---------- */
const deployDir = mkdtempSync(join(tmpdir(), 'londinium-deploy-'))
cpSync(RELEASE, deployDir, { recursive: true })

const hasNodeModules = existsSync(join(deployDir, 'node_modules'))
check('部署目录里没有 node_modules（服务器不需要 install）', !hasNodeModules)

const entries = readdirSync(deployDir).sort()
check(
  '包内容完整',
  ['dist', 'package.json', 'server.mjs'].every((f) => entries.includes(f)),
  entries.join(', '),
)

/* ---------- 1.5 启动脚本质量检查 ----------
 * 这一节来自一个真实踩坑：release 里原本的 start.cmd 是 UTF-8 中文批处理，
 * Windows cmd.exe 按 GBK 解析会报「不是内部或外部命令」，加上 node 不在 PATH 时
 * 直接失败，窗口一闪就关，用户完全不知道发生了什么。 */
{
  const shPath = join(deployDir, 'start.sh')
  const cmdPath = join(deployDir, 'start.cmd')

  check('包含 start.cmd 与 start.sh', existsSync(cmdPath) && existsSync(shPath))

  if (existsSync(cmdPath)) {
    const buf = readFileSync(cmdPath)
    // 必须纯 ASCII：cmd.exe 对 UTF-8 中文的解析是坏的
    const nonAscii = [...buf].filter((b) => b > 127).length
    check('start.cmd 是纯 ASCII（cmd.exe 不会乱码）', nonAscii === 0, `非 ASCII 字节 ${nonAscii}`)

    const cmdText = buf.toString('utf8')
    check('start.cmd 会自己搜索 Node（不依赖 PATH）', cmdText.includes('where node') && cmdText.includes(':try_find'))
    check('start.cmd 找不到 Node 时有指引', cmdText.includes('nodejs.org'))
    check('start.cmd 结束时 pause（窗口不会闪退）', cmdText.includes('pause'))
    check('start.cmd 检查 Node 版本 >= 20', cmdText.includes('LSS 20'))
    check('start.cmd 检查 dist/index.html', cmdText.includes('dist\\index.html'))
  }

  if (existsSync(shPath)) {
    const shText = readFileSync(shPath, 'utf8')
    check('start.sh 会检查 node 是否存在', shText.includes('command -v node'))
    check('start.sh 检查 Node 版本 >= 20', shText.includes('-lt 20'))
  }
}

/* ---------- 1.6 服务端启动健壮性 ----------
 * 真实踩坑：双击 start.cmd 时如果 8787 被上一次没关干净的进程占着，
 * node 会 emit 未捕获的 EADDRINUSE，整个进程崩掉只留一堆堆栈。
 * 现在的行为应该是：自动顺延端口继续启动，并明确告诉用户新端口。 */
{
  const serverMjs = readFileSync(join(deployDir, 'server.mjs'), 'utf8')
  check(
    '发布包包含端口自动顺延逻辑',
    // minify 后中文变 unicode 转义，用转义后的片段判断
    serverMjs.includes('\\u5DF2\\u81EA\\u52A8\\u6539\\u7528') || serverMjs.includes('已自动改用'),
  )
  check('发布包包含倒计时/超时托管逻辑', serverMjs.includes('deadline'))
}

/* ---------- 1.7 实测端口顺延 ----------
 * 只检查字符串不够：必须真的起两个进程，看第二个是否自动换端口继续服务。
 * 这是「双击 start.cmd 闪退」这个真实故障的回归测试。 */
{
  const p1 = 8821
  const first = spawn(process.execPath, ['server.mjs'], {
    cwd: deployDir,
    env: { ...process.env, PORT: String(p1), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let firstLog = ''
  first.stdout.on('data', (d) => {
    firstLog += d.toString()
  })
  first.stderr.on('data', (d) => {
    firstLog += d.toString()
  })

  const ok1 = await waitOk(`http://127.0.0.1:${p1}/healthz`, 15000)
  check('端口顺延测试：第一个实例启动', ok1, ok1 ? '' : firstLog.slice(0, 200))

  if (ok1) {
    // 同样想用 p1 再起一个，应该自动落到 p1+1，而不是崩掉
    const second = spawn(process.execPath, ['server.mjs'], {
      cwd: deployDir,
      env: { ...process.env, PORT: String(p1), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let secondLog = ''
    let secondErr = ''
    second.stdout.on('data', (d) => {
      secondLog += d.toString()
    })
    second.stderr.on('data', (d) => {
      secondErr += d.toString()
    })

    const ok2 = await waitOk(`http://127.0.0.1:${p1 + 1}/healthz`, 15000)
    const crashed = /Unhandled 'error' event|EADDRINUSE/.test(secondErr) && !ok2
    check(
      '端口被占用时自动顺延到下一个端口（不崩溃）',
      ok2 && !crashed,
      ok2 ? `已改用 ${p1 + 1}` : secondErr.slice(0, 200),
    )
    check(
      '顺延后会明确告知新端口',
      secondLog.includes(String(p1 + 1)),
      secondLog.replace(/\s+/g, ' ').slice(0, 120),
    )

    second.kill()
  }

  first.kill()
}

/* ---------- 2. 只用 node server.mjs 启动 ---------- */
const PORT = 8812
const wsUrl = `ws://127.0.0.1:${PORT}/ws`
const httpBase = `http://127.0.0.1:${PORT}/`

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: deployDir,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverLog = ''
server.stdout.on('data', (d) => {
  serverLog += d.toString()
})
server.stderr.on('data', (d) => {
  serverLog += d.toString()
})


/** 极简客户端：拿快照、发消息 */
class Client {
  constructor(name) {
    this.name = name
    this.snap = null
    this.errors = []
    this.ws = null
  }

  connect() {
    return new Promise((resolvePromise, reject) => {
      const ws = new WebSocket(wsUrl)
      this.ws = ws
      const timer = setTimeout(() => reject(new Error(`${this.name} 连接超时`)), 8000)
      ws.on('open', () => {
        clearTimeout(timer)
        resolvePromise()
      })
      ws.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      ws.on('message', (raw) => {
        let msg
        try {
          msg = JSON.parse(raw.toString())
        } catch {
          return
        }
        // 快照是平铺的：{ type:'snapshot', seq, room, match, you }
        if (msg.type === 'snapshot') this.snap = msg
        else if (msg.type === 'error') this.errors.push(msg)
      })
    })
  }

  send(obj) {
    this.ws.send(JSON.stringify(obj))
  }

  async waitUntil(pred, timeoutMs = 8000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      if (this.snap && pred(this.snap)) return this.snap
      await new Promise((r) => setTimeout(r, 60))
    }
    throw new Error(`${this.name} 等待条件超时`)
  }

  close() {
    try {
      this.ws?.close()
    } catch {
      /* 忽略 */
    }
  }
}

const clients = []

try {
  /* ---------- 3. 服务启动 ---------- */
  const up = await waitOk(`${httpBase}healthz`, 15000)
  check('node server.mjs 启动成功（无 npm install）', up, up ? '' : serverLog.slice(0, 400))

  if (up) {
    const health = await (await fetch(`${httpBase}healthz`)).json()
    check('健康检查返回 ok', health.ok === true, JSON.stringify(health))

    const html = await (await fetch(httpBase)).text()
    check('首页能正常返回 HTML', html.includes('<!doctype html') || html.includes('<!DOCTYPE html'))

    // 前端资源真的能取到（打不开资源就白屏）
    const assetMatch = html.match(/src="\.?\/?(assets\/[^"]+\.js)"/)
    if (assetMatch) {
      const assetRes = await fetch(`${httpBase}${assetMatch[1]}`)
      check('前端 JS 资源可访问', assetRes.ok, assetMatch[1])
    } else {
      check('前端 JS 资源可访问', false, '首页里没找到脚本引用')
    }

    /* ---------- 4. 四人真联机：建房 → 加入 → 准备 → 开局 ---------- */
    const host = new Client('房主')
    clients.push(host)
    await host.connect()
    host.send({ type: 'createRoom', name: '房主' })
    const hostSnap = await host.waitUntil((s) => Boolean(s.room?.roomId))
    const roomId = hostSnap.room.roomId
    check('房主建房间成功', Boolean(roomId), `房间码 ${roomId}`)

    for (let i = 2; i <= 4; i += 1) {
      const c = new Client(`玩家${i}`)
      clients.push(c)
      await c.connect()
      c.send({ type: 'joinRoom', roomId, name: `玩家${i}` })
      await c.waitUntil((s) => s.room?.seats.some((x) => x.name === `玩家${i}`))
    }
    check('另外三人加入房间', clients.every((c) => c.snap?.room?.seats.length === 4))

    // 各自点准备
    for (const c of clients) c.send({ type: 'setReady', ready: true })
    await host.waitUntil((s) => s.room?.phase === 'briefing')
    check('四人全部准备后自动开局', true)

    // 简报确认
    for (const c of clients) c.send({ type: 'briefingAck' })
    await host.waitUntil((s) => s.room?.phase === 'picking')
    check('四人确认简报后进入暗选', true)

    /* ---------- 5. 脱敏验证：别人的牌不在我的快照里 ---------- */
    const leakHand = host.snap.match.players.some((p) => 'hand' in p)
    const leakVictory = host.snap.match.players.some((p) => 'victory' in p)
    const leakHeld = host.snap.match.players.some((p) => 'heldDesignated' in p)
    check('发布包的脱敏依然生效（无 hand/victory/heldDesignated 泄漏）', !leakHand && !leakVictory && !leakHeld)

    const hands = clients.map((c) => c.snap.match.self.hand.map((x) => x.id).sort().join(','))
    check('四名玩家手牌互不相同', new Set(hands).size === 4)

    /* ---------- 6. 打完整局 ---------- */
    let guard = 0
    for (; guard < 400; guard += 1) {
      const snap = host.snap
      if (snap.room.phase === 'result') break

      if (snap.room.phase === 'picking') {
        for (const c of clients) {
          const seat = c.snap.room.seats.find((s) => s.playerId === c.snap.you.playerId)
          if (!seat || seat.submittedPick) continue
          const me = c.snap.match.players.find((p) => p.id === c.snap.you.playerId)
          if (me?.defeated) continue
          const acts = c.snap.match.self.hand.filter((x) => x.category === 'action' && x.owner !== 'GENERIC')
          if (acts.length < 2) continue
          c.send({
            type: 'submitPick',
            actionCardIds: acts.slice(0, 2).map((x) => x.id),
            neutralAccept: false,
            designated: { play: null, keep: null },
          })
        }
      } else if (snap.room.phase === 'council') {
        for (const c of clients) {
          const seat = c.snap.room.seats.find((s) => s.playerId === c.snap.you.playerId)
          if (seat && !seat.councilReady) c.send({ type: 'councilReady' })
        }
      } else if (snap.room.phase === 'resolved') {
        for (const c of clients) {
          const seat = c.snap.room.seats.find((s) => s.playerId === c.snap.you.playerId)
          if (seat && !seat.readyNext) c.send({ type: 'readyNext' })
        }
      }
      await new Promise((r) => setTimeout(r, 100))
    }

    check('发布包能打完一整局', host.snap.room.phase === 'result', `第 ${host.snap.match?.round} 回合`)
  }
} catch (err) {
  check('发布包运行过程无异常', false, String(err))
} finally {
  clients.forEach((c) => c.close())
  server.kill()
  await new Promise((r) => setTimeout(r, 300))
  rmSync(deployDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'─'.repeat(52)}`)
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exit(1)
}
console.log('发布包验收通过：解压即可部署 ✓\n')

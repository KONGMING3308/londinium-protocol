/**
 * 同一浏览器多标签页的实测：两个网页必须互不干扰。
 *
 * 用户报告的 bug：「一个浏览器开两个网页会炸，还会创建两个不同的房间」。
 *
 * 根因是所有标签页共享 localStorage：A 建房写身份 → B 建房把它覆盖 →
 * 两个标签页拿着同一个 token 抢同一个座位，服务端关旧连接、客户端又重连，
 * 形成互相顶号的死循环。
 *
 * 本脚本用**同一个浏览器上下文里的两个 page**（共享 localStorage、
 * sessionStorage 各自独立，正是真实多标签页的情形）验证：
 *   1. 后开的标签页不会自动接管前一页的座位（会给出说明，而不是抢座）；
 *   2. 各建各的房间，两个房间码不同且各自稳定；
 *   3. 各自刷新只恢复自己那一局；
 *   4. 观察一段时间，没有任何一方被踢回首页（以前的互踢循环会表现成这条失败）。
 *
 * 用法：
 *   npm run build
 *   node scripts/test-multitab.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

function findEdge() {
  const found = EDGE_CANDIDATES.find((p) => existsSync(p))
  if (!found) throw new Error('未找到 Edge，请安装 Edge 或改用其它 Chromium 内核浏览器')
  return found
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function startServer(port) {
  const child = spawn(process.execPath, [resolve(root, 'server/dist/index.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', () => {})
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))
  return child
}

async function waitServer(url, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
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

async function readRoomCode(page) {
  const el = page.locator('[data-testid="room-code"]')
  await el.waitFor({ timeout: 10000 })
  return (await el.textContent())?.trim() ?? ''
}

async function main() {
  const port = 8961
  const base = `http://127.0.0.1:${port}/`
  const server = startServer(port)
  const browser = await chromium.launch({
    executablePath: findEdge(),
    headless: true,
    args: ['--no-sandbox'],
  })
  // 关键：一个 context 里的两个 page = 同一浏览器开两个标签页
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })

  try {
    if (!(await waitServer(`${base}healthz`))) throw new Error('服务端未能在 15s 内启动')
    check('服务端启动并响应健康检查', true)

    /* ---------- 标签页 A 建房 ---------- */
    const a = await ctx.newPage()
    await a.goto(base)
    await a.waitForSelector('[data-testid="nickname-input"]', { timeout: 15000 })
    await a.fill('[data-testid="nickname-input"]', '甲')
    await a.click('[data-testid="create-room"]')
    const codeA = await readRoomCode(a)
    check('标签页 A 建房成功', codeA.length === 4, `房间 ${codeA}`)

    /* ---------- 标签页 B 打开：不该接管 A 的座位 ---------- */
    const b = await ctx.newPage()
    await b.goto(base)
    await b.waitForSelector('[data-testid="nickname-input"]', { timeout: 15000 })
    await b.waitForTimeout(1200)
    const bHash = await b.evaluate(() => window.location.hash)
    const bBody = (await b.textContent('body')) ?? ''
    check(
      '标签页 B 没有被自动拉进 A 的房间（不抢座位）',
      !bHash.includes('/lobby'),
      `hash=${bHash}`,
    )
    check(
      '标签页 B 给出「另一个标签页正在这局游戏里」的说明',
      bBody.includes('检测到另一个标签页'),
      '没有提示的话用户会以为页面坏了',
    )

    /* ---------- 标签页 B 自己建一个房间 ---------- */
    await b.fill('[data-testid="nickname-input"]', '乙')
    await b.click('[data-testid="create-room"]')
    const codeB = await readRoomCode(b)
    check('标签页 B 也建出一个房间', codeB.length === 4, `房间 ${codeB}`)
    check('两个标签页的房间互不相同', codeA !== codeB, `${codeA} vs ${codeB}`)

    /* ---------- 各自刷新只恢复自己 ---------- */
    await a.reload()
    await a.waitForTimeout(1500)
    const aCodeAfterReload = await readRoomCode(a)
    check('标签页 A 刷新后仍在自己的房间', aCodeAfterReload === codeA, `刷新后 ${aCodeAfterReload}`)

    await b.reload()
    await b.waitForTimeout(1500)
    const bCodeAfterReload = await readRoomCode(b)
    check('标签页 B 刷新后仍在自己的房间', bCodeAfterReload === codeB, `刷新后 ${bCodeAfterReload}`)
    check('刷新后两边依旧不串房间', aCodeAfterReload !== bCodeAfterReload)

    /* ---------- 观察窗口：确认没有互踢 ---------- */
    await a.waitForTimeout(6000)
    const aHash = await a.evaluate(() => window.location.hash)
    const bHash2 = await b.evaluate(() => window.location.hash)
    const aBody = (await a.textContent('body')) ?? ''
    const bBody2 = (await b.textContent('body')) ?? ''
    check(
      '静置 6 秒后两页都还在大厅（没有被互相顶掉）',
      aHash.includes('/lobby') && bHash2.includes('/lobby'),
      `A=${aHash} B=${bHash2}`,
    )
    check(
      '两页显示的都是各自的房间码',
      aBody.includes(codeA) && !aBody.includes(codeB) && bBody2.includes(codeB),
    )
    const aReconnecting = aBody.includes('重连中') || aBody.includes('正在重连')
    const bReconnecting = bBody2.includes('重连中') || bBody2.includes('正在重连')
    check('两页都不在「反复重连」状态', !aReconnecting && !bReconnecting)
  } finally {
    await ctx.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
    server.kill()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'─'.repeat(56)}`)
  console.log(`通过 ${results.length - failed.length} / ${results.length}`)
  if (failed.length > 0) {
    failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
    process.exit(1)
  }
  console.log('多标签页互不干扰验证全部通过 ✓\n')
}

main().catch((err) => {
  console.error('多标签页实测异常：', err)
  process.exit(1)
})

/**
 * 本地热座调试模式的浏览器验证。
 *
 * 目的是证明这个模式**真的能用**，而不是只有单元测试通过：
 * 打开页面 → 点「开始本地热座调试」→ 一键全员准备 → 开局 → 切换操作者选牌
 * → 一路打到终局，全程不需要服务端。
 *
 * 用法：npm run build 之后执行 node scripts/test-local-browser.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!EDGE) throw new Error('未找到 Edge')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 只提供一个静态服务器（不含 WebSocket），用来证明本地模式不需要后端 */
function serveStatic(port) {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
      const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
      const root=${JSON.stringify(resolve(root, 'dist'))};
      const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
      http.createServer((req,res)=>{
        const url=decodeURIComponent((req.url||'/').split('?')[0]);
        let file=path.join(root,url==='/'?'index.html':url);
        if(!file.startsWith(root)){res.writeHead(403).end();return;}
        if(!fs.existsSync(file)||fs.statSync(file).isDirectory()) file=path.join(root,'index.html');
        try{
          const body=fs.readFileSync(file);
          res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});
          res.end(body);
        }catch(e){res.writeHead(404).end();}
      }).listen(${port},'127.0.0.1');
    `,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
  return child
}

const PORT = 8796
const base = `http://127.0.0.1:${PORT}/`

async function waitServer() {
  const t0 = Date.now()
  while (Date.now() - t0 < 12000) {
    try {
      if ((await fetch(base)).ok) return true
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

const server = serveStatic(PORT)
const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })

try {
  if (!(await waitServer())) throw new Error('静态服务器未启动')
  check('静态服务器启动（注意：没有任何 WebSocket 后端）', true)

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  // 收集页面异常：本地模式不该有任何运行时错误
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(base)
  await page.waitForSelector('[data-testid="toggle-local-mode"]', { timeout: 15000 })
  check('首页加载出本地调试入口', true)

  /* ---- 资料页导航：不能被状态机劫持 ----
   * 曾经的 bug：首页点「新手引导」，PhaseSync 发现 room 是 null 就 navigate('/')，
   * 点击看起来完全没反应。这里固化成回归测试。 */
  for (const [href, label] of [
    ['#/guide', '新手引导'],
    ['#/rules', '规则'],
  ]) {
    await page.click(`a[href="${href}"]`)
    await page.waitForTimeout(700)
    const hash = await page.evaluate(() => window.location.hash)
    check(`点击「${label}」能真正打开（不被弹回首页）`, hash === href, `实际 ${hash}`)
    const body = await page.locator('body').innerText()
    check(`「${label}」页内容正常渲染`, body.length > 200, `${body.length} 字`)
    // 回到首页，继续后面的流程
    await page.goto(base)
    await page.waitForSelector('[data-testid="toggle-local-mode"]', { timeout: 15000 })
    await page.waitForTimeout(400)
  }

  // 顶部连接徽标应显示「未连接」——因为没有后端
  await page.waitForTimeout(600)

  await page.click('[data-testid="toggle-local-mode"]')
  await page.fill('#local-names', '甲,乙,丙,丁')
  await page.click('[data-testid="start-local-mode"]')

  // 进入大厅
  await page.waitForFunction(() => window.location.hash.includes('/lobby'), undefined, { timeout: 10000 })
  check('点击调试入口后进入大厅', true)

  // 座位卡渲染比路由切换稍晚，等它出现再数
  await page.waitForSelector('[data-testid="seat-card"]', { timeout: 10000 })
  const seats = await page.locator('[data-testid="seat-card"]').count()
  check('大厅里直接有 4 个座位（不用输房间码）', seats === 4, `${seats} 个`)

  const debugBar = page.locator('[data-testid="local-debug-bar"]')
  check('出现本地调试控制条', (await debugBar.count()) > 0)

  // 一键全员准备 → 自动开局
  await page.click('[data-testid="local-ready-all"]')
  await page.waitForFunction(() => window.location.hash.includes('/briefing'), undefined, { timeout: 10000 })
  check('一键四人准备后自动开局进入简报', true)

  // 一键全员确认
  await page.click('[data-testid="local-ack-all"]')
  await page.waitForFunction(() => window.location.hash.includes('/round'), undefined, { timeout: 10000 })
  check('一键四人确认后进入回合页', true)

  // 切换操作者：切换后应能看到另一个人
  const viewer1 = page.locator('[data-testid="local-viewer-甲"]')
  const viewer2 = page.locator('[data-testid="local-viewer-乙"]')
  check('调试条上有四个可切换的操作者', (await page.locator('[data-testid^="local-viewer-"]').count()) === 4)

  // 甲提交
  await viewer1.click()
  await page.waitForTimeout(300)
  const cards1 = page.locator('[data-testid="action-card"]')
  const n1 = await cards1.count()
  check('切到「甲」后能看到行动牌', n1 >= 2, `${n1} 张`)

  // 记录甲的手牌（用牌名），切到乙后应该不同
  const handA = await cards1.allTextContents()

  await viewer2.click()
  await page.waitForTimeout(300)
  const handB = await page.locator('[data-testid="action-card"]').allTextContents()
  check(
    '切换操作者后手牌不同（热座的核心语义）',
    handA.join('|') !== handB.join('|'),
    `${handA.length} 张 vs ${handB.length} 张`,
  )

  // 用「切换操作者 → 选牌提交」把一局打完
  let guard = 0
  while (guard < 60) {
    guard += 1
    const hash = await page.evaluate(() => window.location.hash)
    if (hash.includes('/result')) break

    if (hash.includes('/round')) {
      // 轮流让每个人提交 / 就绪
      const names = ['甲', '乙', '丙', '丁']
      for (const name of names) {
        const btn = page.locator(`[data-testid="local-viewer-${name}"]`)
        if ((await btn.count()) === 0) continue
        await btn.click()
        await page.waitForTimeout(120)

        const submit = page.locator('[data-testid="submit-pick"]')
        if ((await submit.count()) > 0) {
          const cards = page.locator('[data-testid="action-card"]')
          if ((await cards.count()) >= 2) {
            const c0 = cards.nth(0)
            const c1 = cards.nth(1)
            if (await c0.isEnabled()) await c0.click()
            if (await c1.isEnabled()) await c1.click()
            for (const key of ['keep-new', 'keep-held']) {
              const b = page.locator(`[data-testid="designated-${key}"]`)
              if ((await b.count()) > 0 && (await b.first().isEnabled())) {
                await b.first().click()
                break
              }
            }
            try {
              await page.waitForFunction(
                () => {
                  const b = document.querySelector('[data-testid="submit-pick"]')
                  return b instanceof HTMLButtonElement && !b.disabled
                },
                undefined,
                { timeout: 2000 },
              )
              await submit.first().click()
            } catch {
              /* 本轮凑不出合法组合 */
            }
          }
        }
        const ready = page.locator('[data-testid="council-ready"]')
        if ((await ready.count()) > 0 && (await ready.first().isEnabled())) {
          await ready.first().click()
        }
      }
    } else if (hash.includes('/resolve')) {
      const names = ['甲', '乙', '丙', '丁']
      for (const name of names) {
        const btn = page.locator(`[data-testid="local-viewer-${name}"]`)
        if ((await btn.count()) > 0) {
          await btn.click()
          await page.waitForTimeout(100)
        }
        const noDeal = page.locator('[data-testid="faction-no-deal"]')
        if ((await noDeal.count()) > 0 && (await noDeal.first().isEnabled())) {
          await noDeal.first().click()
        }
        const next = page.locator('[data-testid="ready-next"]')
        if ((await next.count()) > 0 && (await next.first().isEnabled())) {
          await next.first().click()
        }
      }
    }
    await page.waitForTimeout(300)
  }

  const finalHash = await page.evaluate(() => window.location.hash)
  check('本地模式在一台设备上打完整局', finalHash.includes('/result'), `最终 ${finalHash}`)

  check('本地模式全程没有页面运行时错误', errors.length === 0, errors.join(' | '))

  // 关键：整个过程中服务端从未存在过
  check('全程未依赖任何 WebSocket 后端', true)
} finally {
  await browser.close().catch(() => undefined)
  server.kill()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${'─'.repeat(50)}`)
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exit(1)
}
console.log('本地热座调试模式浏览器验证全部通过 ✓\n')

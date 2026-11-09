/**
 * 浏览器端四客户端联机实测：用本机 Edge 开四个真实浏览器上下文。
 *
 * 与 scripts/test-online.mjs 的分工：
 * - test-online.mjs 测协议与服务端（不含 UI）
 * - 本脚本测「用户真正看到并点击的东西」：建房、输房间码入房、点准备、
 *   看自己的胜利条件、选牌提交、等待他人、进入下一回合，一直打到终局。
 *
 * 用法：
 *   npm run build
 *   node scripts/test-browser.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
/** 落盘目录指到临时目录：测试不该往仓库或部署目录里写房间数据 */
const persistDir = mkdtempSync(join(tmpdir(), 'londinium-test-data-'))

/** 本机 Edge 路径候选：优先系统安装版 */
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

/** 起服务端（同时提供静态产物与 /ws） */
function startServer(port) {
  const child = spawn(process.execPath, [resolve(root, 'server/dist/index.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: persistDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', () => {})
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))
  return child
}

/** 等到 HTTP 可用 */
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

/** 从页面里读房间码（Shell 顶部与大厅页都有，取大厅那个大号显示） */
async function readRoomCode(page) {
  const el = page.locator('[data-testid="room-code"]')
  await el.waitFor({ timeout: 10000 })
  return (await el.textContent())?.trim() ?? ''
}

/** 等某个角色进入指定页面（用 hash 路由判断） */
async function waitHash(page, hash, timeout = 20000) {
  await page.waitForFunction(
    (h) => window.location.hash.includes(h),
    hash,
    { timeout },
  )
}

async function main() {
  const port = 8791
  const base = `http://127.0.0.1:${port}/`
  const server = startServer(port)
  const browser = await chromium.launch({
    executablePath: findEdge(),
    headless: true,
    args: ['--no-sandbox'],
  })
  const contexts = []
  const pages = []

  try {
    if (!(await waitServer(`${base}healthz`))) throw new Error('服务端未能在 15s 内启动')
    check('服务端启动并响应健康检查', true)

    /* ---------- 四个独立浏览器上下文（相当于四台设备） ---------- */
    for (let i = 0; i < 4; i += 1) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      contexts.push(ctx)
      pages.push(await ctx.newPage())
    }
    const [p1, p2, p3, p4] = pages
    const names = ['甲', '乙', '丙', '丁']

    for (let i = 0; i < 4; i += 1) {
      await pages[i].goto(base)
      await pages[i].waitForSelector('[data-testid="nickname-input"]', { timeout: 15000 })
      await pages[i].fill('[data-testid="nickname-input"]', names[i])
    }
    check('四个客户端都加载出首页并填好昵称', true)

    /* ---------- 房主建房 ---------- */
    await p1.click('[data-testid="create-room"]')
    await waitHash(p1, '/lobby')
    const roomCode = await readRoomCode(p1)
    check('房主创建房间并进入大厅', roomCode.length === 4, `房间码 ${roomCode}`)

    /* ---------- 其余三人输码入房 ---------- */
    for (let i = 1; i < 4; i += 1) {
      await pages[i].fill('[data-testid="room-code-input"]', roomCode)
      await pages[i].click('[data-testid="join-room"]')
      await waitHash(pages[i], '/lobby')
    }
    // 等房主看到 4 个座位
    await p1.waitForFunction(
      () => document.querySelectorAll('[data-testid="seat-card"]').length === 4,
      undefined,
      { timeout: 15000 },
    )
    check('四人进入同一大厅（4 个座位）', true)

    // 四人看到的房间码一致
    const codes = await Promise.all(pages.map(readRoomCode))
    check('四个客户端显示同一房间码', new Set(codes).size === 1, codes.join(' / '))

    /* ---------- 准备流程 ---------- */
    // 先让三人准备，验证第四人未准备时不开局
    for (let i = 0; i < 3; i += 1) {
      await pages[i].click('[data-testid="ready-toggle"]')
    }
    await p1.waitForTimeout(400)
    check('三人准备后仍在等待（未开局）', (await readRoomCode(p4)) === roomCode)

    // 第四人准备 → 自动开局
    await p4.click('[data-testid="ready-toggle"]')
    await waitHash(p1, '/briefing')
    check('四人全部准备后自动开局进入战前简报', true)

    for (let i = 0; i < 4; i += 1) {
      await waitHash(pages[i], '/briefing')
    }
    check('四个客户端都进入战前简报', true)

    /* ---------- 简报：各自确认自己的胜利条件 ---------- */
    // 公开情报里不该出现任何人的胜利条件描述
    for (let i = 0; i < 4; i += 1) {
      const body = await pages[i].textContent('body')
      const leaked = ['战争进度', '国剑 + 三线', '阿喃那被针对', '塔拉独立未被针对', '新纲领成立', '存活到终局']
        .filter((t) => body?.includes(t))
      // 公开段允许出现「胜利条件：本人确认」这类提示，但不该出现具体条件标题
      const hardLeak = leaked.filter((t) => t !== '战争进度')
      if (hardLeak.length > 0) {
        check(`第 ${i + 1} 位玩家的简报页未泄露他人胜利条件`, false, hardLeak.join(','))
      }
    }
    check('简报页未公开他人胜利条件', !results.some((r) => r.name.includes('未泄露') && !r.ok))

    // 各自点「查看我的目标」→ 确认
    for (let i = 0; i < 4; i += 1) {
      const reveal = pages[i].locator('[data-testid="reveal-victory"]')
      if (await reveal.count()) await reveal.first().click()
      const ack = pages[i].locator('[data-testid="briefing-ack"]')
      await ack.first().waitFor({ timeout: 10000 })
      await ack.first().click()
    }
    await waitHash(p1, '/round')
    check('四人确认简报后进入回合页', true)

    /* ---------- 回合页新增内容：剧情卡 + 中立资源竞标 ---------- */
    for (let i = 0; i < 4; i += 1) {
      // 剧情事件卡：每回合随机抽 1 个，必须显示给全桌
      await pages[i].locator('[data-testid="round-story"]').first().waitFor({ timeout: 10000 })
    }
    check('四人回合页都显示本回合剧情事件', true)

    const storyText = (await p1.textContent('[data-testid="round-story"]')) ?? ''
    check('剧情卡写明「全场生效」的数值影响', storyText.includes('全场生效'), storyText.slice(0, 60))

    for (let i = 0; i < 4; i += 1) {
      await pages[i].locator('[data-testid="neutral-bid-panel"]').first().waitFor({ timeout: 10000 })
    }
    check('四人回合页都出现中立资源竞标面板', true)

    const bidPanelText = (await p1.textContent('[data-testid="neutral-bid-panel"]')) ?? ''
    check('竞标面板说明了「其余人的出价不退」', bidPanelText.includes('不退'), bidPanelText.slice(0, 80))
    const pointBtns = p1.locator('[data-testid^="bid-point-"]')
    check('竞标面板列出了可选资源点', (await pointBtns.count()) >= 2, `${await pointBtns.count()} 个`)

    /* ---------- 回合并行暗选：打到终局 ---------- */
    /** 整局中是否在结算页见过「竞标结果」块 */
    let sawBidResult = false
    let safety = 0
    while (safety < 60) {
      safety += 1
      const hashNow = await p1.evaluate(() => window.location.hash)
      if (hashNow.includes('/result')) break

      // 1) 暗选：各自选牌提交
      for (const page of pages) {
        const hash = await page.evaluate(() => window.location.hash)
        if (!hash.includes('/round')) continue
        const submit = page.locator('[data-testid="submit-pick"]')
        if ((await submit.count()) === 0) continue

        const cards = page.locator('[data-testid="action-card"]')
        if ((await cards.count()) < 2) continue
        const first = cards.nth(0)
        const second = cards.nth(1)
        if (await first.isEnabled()) await first.click()
        if (await second.isEnabled()) await second.click()

        /* 中立资源竞标：只有 P1 出价（用面板上的最小合法值），
         * 其余人不出价 —— 这样每回合 P1 都能验证「出价 → 结算 → 拿奖励」链路，
         * 同时也能覆盖「没人抢时无人扣钱」的情况。 */
        if (page === p1) {
          const pointBtns2 = page.locator('[data-testid^="bid-point-"]')
          if ((await pointBtns2.count()) > 0) {
            const amountInput = page.locator('[data-testid="bid-amount"]')
            // 先选一个点（点击后金额输入框才可用）
            await pointBtns2.first().click()
            if ((await amountInput.count()) > 0) {
              // 面板上标着「最低出价 N」，取 1 作为保守值；
              // 若最低出价更高，服务端会拒绝，本轮就不抢（不影响流程）
              await amountInput.first().fill('1')
            }
          }
        }

        // 指定牌处置：保留是最省事且永远合法的选择
        for (const key of ['keep-new', 'keep-held']) {
          const btn = page.locator(`[data-testid="designated-${key}"]`)
          if ((await btn.count()) > 0 && (await btn.first().isEnabled())) {
            await btn.first().click()
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
            { timeout: 3000 },
          )
          await submit.first().click()
        } catch {
          /* 本轮凑不出合法组合就留给下一轮 */
        }
      }

      // 2) 盟约窗口：所有人点就绪
      for (const page of pages) {
        const hash = await page.evaluate(() => window.location.hash)
        if (!hash.includes('/round')) continue
        const ready = page.locator('[data-testid="council-ready"]')
        if ((await ready.count()) > 0 && (await ready.first().isEnabled())) {
          await ready.first().click()
        }
      }

      // 3) 结算页：能谈就「这回合不谈」，然后进入下一回合
      for (const page of pages) {
        const hash = await page.evaluate(() => window.location.hash)
        if (!hash.includes('/resolve')) continue
        // 结算页应显示本回合剧情（含数值影响），而不只是叙事标题
        if (page === p1) {
          const storyEl = page.locator('[data-testid="resolve-story"]')
          if ((await storyEl.count()) > 0) {
            const t = (await storyEl.first().textContent()) ?? ''
            if (!t.includes('剧情影响')) {
              check('结算页显示出本回合剧情影响', false, t.slice(0, 60))
            }
          }
        }
        if (page === p1) {
          const bidsEl = page.locator('[data-testid="resolve-bids"]')
          if ((await bidsEl.count()) > 0) {
            const t = (await bidsEl.first().textContent()) ?? ''
            if (t.includes('夺得') || t.includes('流拍')) sawBidResult = true
          }
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

      await p1.waitForTimeout(350)
    }

    const finalHash = await p1.evaluate(() => window.location.hash)
    check('打完整局并进入终局页', finalHash.includes('/result'), `最终路由 ${finalHash}`)
    check('终局页有结果内容', (await p1.textContent('body'))?.match(/Final Report|无人获胜|获胜/) !== null)

    // 四个客户端都到终局
    let allAtResult = true
    for (const page of pages) {
      const h = await page.evaluate(() => window.location.hash)
      if (!h.includes('/result')) allAtResult = false
    }
    check('四个客户端都进入终局页', allAtResult)

    check('整局过程中结算页确实展示过竞标结果', sawBidResult, '每回合 P1 都出价，应至少命中一次')


    /* ---------- 刷新重连 ---------- */
    const codeBefore = roomCode
    await p2.reload()
    await p2.waitForFunction(
      () => document.querySelector('[data-testid="app-version"]') !== null,
      undefined,
      { timeout: 15000 },
    )
    await p2.waitForTimeout(800)
    const h2 = await p2.evaluate(() => window.location.hash)
    check('刷新后自动回到对局（无需重新输房间码）', h2.includes('/result') || h2.includes('/round'), h2)
    const body2 = await p2.textContent('body')
    check('重连后仍能看到原房间码', body2?.includes(codeBefore) ?? false)
  } finally {
    await Promise.all(contexts.map((c) => c.close().catch(() => undefined)))
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
  console.log('浏览器四客户端实测全部通过 ✓\n')
}

main().catch((err) => {
  console.error('浏览器实测异常：', err)
  process.exit(1)
})

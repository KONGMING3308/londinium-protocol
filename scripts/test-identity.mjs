/**
 * 多标签页身份隔离的单元测试。
 *
 * 背景（用户实测报告）：**同一浏览器开两个网页会炸，还会创建两个不同的房间。**
 *
 * 根因：所有标签页共享 localStorage。A 建房写身份 → B 建房把它覆盖 → 谁刷新都读到
 * 「最后写的那个」，两个标签页于是拿着同一个 token 抢同一个座位，服务端关旧连接、
 * 客户端又重连，形成互相顶号的死循环。
 *
 * 修法：每标签页一份 sessionStorage 身份 + localStorage 只留带心跳的「最近会话」快照，
 * 新标签页发现主人还活着就不接管。
 *
 * 这里用两个独立的模块实例 + 两套 sessionStorage + 一份共享 localStorage 精确模拟
 * 两个标签页各自的内存与共享的存储。
 *
 * 用法：node scripts/test-identity.mjs
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 最小 Storage 实现：浏览器 storage 的子集 */
function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  }
}

const outdir = mkdtempSync(join(tmpdir(), 'londinium-identity-'))
try {
  const outfile = join(outdir, 'identity.mjs')
  await build({
    entryPoints: [resolve(root, 'src/net/identity.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })
  const baseUrl = pathToFileURL(outfile).href

  // 两个独立的模块实例 = 两个标签页；query 让 ESM 缓存不合并
  const tabA = await import(`${baseUrl}?tab=a`)
  const tabB = await import(`${baseUrl}?tab=b`)

  const local = fakeStorage() // 共享的 localStorage
  const sessionA = fakeStorage()
  const sessionB = fakeStorage()
  tabA.initIdentityStorage(sessionA, local)
  tabB.initIdentityStorage(sessionB, local)

  /* ---------- 1. 全新环境没有会话 ---------- */
  check('全新环境：A 读不到身份', tabA.loadIdentity() === null)
  check('全新环境：B 读不到身份', tabB.loadIdentity() === null)
  check('两个标签页的 tabId 不同', tabA.getTabId() !== tabB.getTabId())

  /* ---------- 2. A 建房保存身份 ---------- */
  tabA.saveIdentity('AAAA', 'p1', 'token-of-a', '房主A')
  const identA = tabA.loadIdentity()
  check('A 保存后能读回自己的身份', identA?.roomId === 'AAAA' && identA?.token === 'token-of-a', identA?.roomId)

  /* ---------- 3. B 是新标签页，不该抢 A 的座位 ---------- */
  check(
    'B 不接管 A 的会话（A 还活着）',
    tabB.loadIdentity() === null,
    '若这里返回了 A 的身份，两个标签页就会抢同一个座位',
  )
  check('B 能看到「有别人在用」的提示信号', tabB.hasForeignActiveSession() === true)

  /* ---------- 4. A 关闭后，B 可以接手（关掉重开还能继续打） ---------- */
  tabA.releaseTab()
  const inherited = tabB.loadIdentity()
  check(
    'A 关闭后 B 能接手同一局',
    inherited?.roomId === 'AAAA' && inherited?.token === 'token-of-a',
    inherited?.roomId,
  )

  /* ---------- 5. 心跳过期 = 主人已死，同样可以接手 ---------- */
  tabB.clearIdentity()
  tabA.saveIdentity('BBBB', 'p2', 'token-of-a2', '房主A')
  // 把 A 的心跳改成 20 秒前（超过 15 秒 TTL）
  local.setItem(`londinium-protocol-alive:${tabA.getTabId()}`, String(Date.now() - 20000))
  check('心跳过期后不再算作「别人在用」', tabB.hasForeignActiveSession() === false)
  check(
    '心跳过期后 B 可以接手',
    tabB.loadIdentity()?.roomId === 'BBBB',
    '超过 15 秒没打点就应该允许接手',
  )

  /* ---------- 6. 两个标签页各自保存，互不覆盖 ---------- */
  tabB.clearIdentity()
  tabA.saveIdentity('ROOM-A', 'pA', 'token-A', 'A')
  tabB.saveIdentity('ROOM-B', 'pB', 'token-B', 'B')
  const idA = tabA.loadIdentity()
  const idB = tabB.loadIdentity()
  check(
    '两标签页各自保存后仍各读各的',
    idA?.roomId === 'ROOM-A' && idB?.roomId === 'ROOM-B',
    `A=${idA?.roomId} B=${idB?.roomId}`,
  )
  check('两标签页的 token 不会串', idA?.token !== idB?.token, `${idA?.token} vs ${idB?.token}`)

  /* ---------- 7. 刷新场景：sessionStorage 还在 → 直接恢复 ---------- */
  // 刷新 = 内存状态重置但 sessionStorage 保留：再 init 一次、tabId 沿用
  tabA.initIdentityStorage(sessionA, local)
  const afterReload = tabA.loadIdentity()
  check(
    '刷新后（sessionStorage 保留）恢复自己的身份',
    afterReload?.roomId === 'ROOM-A' && afterReload?.token === 'token-A',
    afterReload?.roomId,
  )

  /* ---------- 8. clearIdentity 只清自己，不动别人的快照 ---------- */
  tabA.clearIdentity()
  check('A 清身份后 A 读不到', tabA.loadIdentity() === null)
  check('B 的快照没有被 A 清掉', local.getItem('londinium-protocol-net-last') !== null)
  check('B 仍然读得到自己的身份', tabB.loadIdentity()?.roomId === 'ROOM-B')
} finally {
  rmSync(outdir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log('\n' + '─'.repeat(60))
console.log(`通过 ${results.length - failed.length} / ${results.length}`)
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ✗ ${f.name} ${f.detail}`))
  process.exitCode = 1
} else {
  console.log('多标签页身份隔离验证全部通过 ✓')
}

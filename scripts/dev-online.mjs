/**
 * 联机开发环境一键启动：同时跑「Node 服务端」和「Vite 前端」。
 *
 * 为什么不直接用 npm-run-all / concurrently
 * - 项目里没这两个依赖，为了一个脚本引入不值得。
 * - 这里只需要「同时起两个子进程 + 任一退出就一起收」，
 *   用 node:child_process 二十行就能写清楚，还能顺手统一日志前缀。
 *
 * 用法：npm run dev:online
 * 然后四个人各自打开终端里显示的地址（同一台机器开四个标签页也行）。
 *
 * 为什么要给 vite 加 --host
 * vite 默认只监听 127.0.0.1，别人从局域网连不进来——而联机版最常见的用法
 * 恰恰是叫朋友从隔壁电脑连过来。服务端 8787 本来就是 0.0.0.0，前端也一起放开，
 * 免得出现「本机能玩、朋友打不开」这种一半能用的状态。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { networkInterfaces } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const isWin = process.platform === 'win32'
/** Windows 上 npm/npx 是 .cmd，必须经 shell 才能 spawn */
const shell = isWin

const children = []
let shuttingDown = false

function run(label, command, args, color) {
  const child = spawn(command, args, {
    cwd: root,
    shell,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  children.push(child)

  const prefix = `\x1b[${color}m[${label}]\x1b[0m `
  const pipe = (stream, isErr) => {
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      lines.forEach((line) => {
        if (line.length > 0) {
          const out = isErr ? process.stderr : process.stdout
          out.write(prefix + line + '\n')
        }
      })
    })
  }
  pipe(child.stdout, false)
  pipe(child.stderr, true)

  child.on('exit', (code) => {
    if (shuttingDown) return
    console.log(`${prefix}进程退出（code=${code}），正在停止其余进程…`)
    shutdown(code ?? 0)
  })
  return child
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  children.forEach((c) => {
    if (!c.killed) {
      try {
        c.kill()
      } catch {
        /* 忽略 */
      }
    }
  })
  setTimeout(() => process.exit(code), 200)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

/* 1. 先构建一次服务端，保证 server/dist 存在 */
if (!existsSync(resolve(root, 'server/dist/index.mjs'))) {
  mkdirSync(resolve(root, 'server/dist'), { recursive: true })
}
console.log('[setup] 构建服务端…')
const buildOnce = spawn(process.execPath, [resolve(root, 'scripts/build-server.mjs')], {
  cwd: root,
  stdio: 'inherit',
})
buildOnce.on('exit', (code) => {
  if (code !== 0) {
    console.error('[setup] 服务端构建失败，已中止。')
    process.exit(code ?? 1)
  }
  startAll()
})

/** 找一个合适的局域网 IPv4 地址，用来打印「把这个发给朋友」 */
function lanAddress() {
  const ifaces = networkInterfaces()
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return null
}

function startAll() {
  console.log('[setup] 启动服务端与前端…\n')
  run('server', process.execPath, [resolve(root, 'server/dist/index.mjs')], '36')
  // --host 让 vite 监听 0.0.0.0，局域网其它机器才连得进来
  run('vite', isWin ? 'npx.cmd' : 'npx', ['vite', '--host'], '35')
  const ip = lanAddress()
  if (ip) {
    // 等 vite 打印完自己的地址再补这一行，避免插在中间显得乱
    setTimeout(() => {
      console.log('')
      console.log('  ── 四个人联机 ──────────────────────────────')
      console.log(`  本机测试：  http://localhost:5173/`)
      console.log(`  发给朋友：  http://${ip}:5173/`)
      console.log('  （朋友要和你连同一个 Wi-Fi，且防火墙已放行 5173）')
      console.log('  ────────────────────────────────────────────')
      console.log('')
    }, 2500)
  }
}

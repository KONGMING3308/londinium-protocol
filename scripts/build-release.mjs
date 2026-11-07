/**
 * 发布打包：生成一个「复制到服务器上就能跑」的目录 / zip。
 *
 * 设计目标
 * - 服务器上**不需要 npm install**：`ws` 是纯 JS、零依赖，直接内联进单文件产物；
 * - 服务器上**不需要 Node 之外任何东西**：没有构建工具、没有 devDependencies；
 * - 前端静态资源 + 服务端脚本放在同一个包里，解压后一条命令启动。
 *
 * 产物结构（release/londinium-protocol-v0.3.0/）
 *   server.mjs          ← 服务端单文件（含 ws，零依赖）
 *   dist/               ← 前端静态资源
 *   package.json        ← 只用于声明 type=module 与版本号
 *   .env.example        ← 端口等配置示例
 *   start.sh / start.cmd← 一键启动
 *   README-部署.md      ← 给运维看的部署说明
 *
 * 用法：node scripts/build-release.mjs
 */
import { build } from 'esbuild'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAliasPlugin } from './esbuild-alias.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const VERSION = pkg.version
const OUT_DIR = resolve(root, 'release', `londinium-protocol-v${VERSION}`)

/* ---------- 0. 前置检查：前端产物必须已存在 ---------- */
const distDir = resolve(root, 'dist')
if (!existsSync(join(distDir, 'index.html'))) {
  console.error('[release] 缺少 dist/index.html，请先运行 npm run build')
  process.exit(1)
}

/* ---------- 1. 清空并准备输出目录 ---------- */
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

console.log(`[release] 打包 v${VERSION} → ${OUT_DIR}`)

/* ---------- 2. 打包服务端单文件（ws 内联，零外部依赖） ---------- */
/**
 * 为什么要把 ws 内联
 * - 默认构建把 ws 标记为 external，服务器上就必须有 node_modules/ws；
 * - 而 ws 是纯 JavaScript、本身零运行时依赖，内联后整个服务端就是一个文件，
 *   部署时不需要 npm install，也不会因为服务器 Node 版本不同而装错包。
 *
 * 为什么需要 createRequire 的 banner
 * - ws 内部是 CommonJS（用 require('events') 等），直接内联进 ESM 会报
 *   "Dynamic require of 'events' is not supported"；
 * - esbuild 官方推荐的解法就是在 ESM 顶部补一个真正的 require。
 */
const bannerRequire =
  "import { createRequire as __createRequire } from 'node:module';" +
  'const require = __createRequire(import.meta.url);'

await build({
  entryPoints: [resolve(root, 'server/index.ts')],
  outfile: join(OUT_DIR, 'server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // 这两个是 ws 的可选原生加速模块，没有也能正常工作，必须外部化
  external: ['bufferutil', 'utf-8-validate'],
  plugins: [createAliasPlugin(root)],
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  banner: { js: bannerRequire },
})
console.log('[release] server.mjs 打包完成（ws 已内联）')

/* ---------- 3. 复制前端静态资源 ---------- */
cpSync(distDir, join(OUT_DIR, 'dist'), { recursive: true })
console.log('[release] dist/ 已复制')

/* ---------- 4. 生成 package.json / .env.example / 启动脚本 / 部署说明 ---------- */

writeFileSync(
  join(OUT_DIR, 'package.json'),
  `${JSON.stringify(
    {
      name: 'londinium-protocol-server',
      version: VERSION,
      private: true,
      type: 'module',
      description: '伦蒂尼姆协议 · 四人联机服务端（单文件，无需 npm install）',
      engines: { node: '>=20' },
      scripts: {
        start: 'node server.mjs',
      },
    },
    null,
    2,
  )}\n`,
  'utf8',
)

writeFileSync(
  join(OUT_DIR, '.env.example'),
  `# 复制为 .env 后按需修改（也可以直接用环境变量传）
# 注意：本项目不自动读取 .env，下面只是给启动脚本用的参考值

# 监听端口（默认 8787）
PORT=8787

# 监听地址。0.0.0.0 表示所有网卡，公网部署保持默认
HOST=0.0.0.0

# 前端静态资源目录（默认与本文件同级的 dist）
STATIC_DIR=./dist

# 空房间回收时限，毫秒。默认 6 小时
ROOM_TTL=21600000
`,
  'utf8',
)

writeFileSync(
  join(OUT_DIR, 'start.sh'),
  `#!/bin/sh
# Londinium Protocol - launcher (Linux / macOS)
#
# Pure ASCII on purpose: must run on minimal shells without UTF-8 locale.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found on PATH."
  echo "        This server needs Node.js 20 or newer: https://nodejs.org"
  exit 1
fi

MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$MAJOR" -lt 20 ] 2>/dev/null; then
  echo "[ERROR] Node $(node -v) is too old; need v20 or newer."
  exit 1
fi

if [ ! -f dist/index.html ]; then
  echo "[ERROR] dist/index.html is missing; package looks incomplete."
  exit 1
fi

export PORT="\${PORT:-8787}"
export HOST="\${HOST:-0.0.0.0}"
export STATIC_DIR="\${STATIC_DIR:-./dist}"

echo ""
echo "  =========================================="
echo "   Londinium Protocol - Server"
echo "  =========================================="
echo "  Node: $(node -v)"
echo "  Open: http://localhost:\$PORT/"
echo ""
exec node server.mjs
`,
  'utf8',
)

writeFileSync(
  join(OUT_DIR, 'start.cmd'),
  `@echo off
setlocal enabledelayedexpansion
title Londinium Protocol Server
cd /d "%~dp0"

REM =====================================================================
REM  Londinium Protocol - launcher (Windows)
REM
REM  Finds Node.js by itself, even if it is not on PATH, and prints
REM  actionable instructions when something is missing instead of
REM  closing the window instantly.
REM
REM  IMPORTANT: keep this file PURE ASCII. Windows cmd.exe mis-parses
REM  UTF-8 (mojibake + broken commands). Chinese docs: README-deploy.md
REM =====================================================================

if "%PORT%"=="" set PORT=8787
if "%HOST%"=="" set HOST=0.0.0.0
if "%STATIC_DIR%"=="" set STATIC_DIR=./dist

echo.
echo  ==========================================
echo   Londinium Protocol - Server
echo  ==========================================
echo.

REM ---------- 1. Look for node on PATH ----------
set "NODE_EXE="
for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%i"
)

REM ---------- 2. Not on PATH: search common install locations ----------
if not defined NODE_EXE (
  call :try_find "%LOCALAPPDATA%\\Programs\\nodejs\\node.exe"
  call :try_find "%ProgramFiles%\\nodejs\\node.exe"
  call :try_find "%ProgramFiles(x86)%\\nodejs\\node.exe"
  call :try_find "%USERPROFILE%\\.local\\share\\nodejs\\node-v20.18.0-win-x64\\node.exe"
  call :try_find "%USERPROFILE%\\scoop\\apps\\nodejs\\current\\node.exe"
  call :try_find "%APPDATA%\\nvm\\current\\node.exe"
)

REM ---------- 3. Still nothing: actionable instructions ----------
if not defined NODE_EXE (
  echo  [ERROR] Node.js not found.
  echo.
  echo  This game server requires Node.js 20 or newer.
  echo.
  echo  How to fix:
  echo    1^) Download the LTS installer from https://nodejs.org
  echo       Keep the default options ^(it adds Node to PATH^).
  echo    2^) If you already have a portable Node, add its folder to PATH.
  echo.
  echo  After installing, close this window and run start.cmd again.
  echo.
  goto :fail
)

echo  [1/3] Node:    !NODE_EXE!
for /f "delims=" %%v in ('"!NODE_EXE!" -v') do set "NODE_VER=%%v"
echo  [2/3] Version: !NODE_VER!

REM ---------- 4. Require Node 20+ ----------
set "MAJOR="
for /f "tokens=1 delims=." %%a in ("!NODE_VER:v=!") do set "MAJOR=%%a"
if !MAJOR! LSS 20 (
  echo.
  echo  [ERROR] Node is too old ^(found !NODE_VER!, need v20+^).
  echo  Please install a newer version from https://nodejs.org
  echo.
  goto :fail
)

REM ---------- 5. Static assets must exist ----------
if not exist "dist\\index.html" (
  echo.
  echo  [ERROR] dist\\index.html is missing.
  echo  The package looks incomplete. Please extract the zip again.
  echo.
  goto :fail
)
echo  [3/3] Assets:  OK
echo.
echo  Starting server...
echo  Open this in your browser:  http://localhost:%PORT%/
echo  Close this window to stop the server.
echo.

REM ---------- 6. Warn early when the port is taken ----------
netstat -ano | findstr ":%PORT% " | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
  echo  [WARN] Port %PORT% seems to be in use already.
  echo  Close the previous server window, or use another port:
  echo       set PORT=8788 ^&^& start.cmd
  echo.
)

REM ---------- 7. Start ----------
"!NODE_EXE!" server.mjs
set "EXITCODE=%errorlevel%"

echo.
if not "%EXITCODE%"=="0" (
  echo  [Server exited] code %EXITCODE%
  echo.
  goto :fail
)
echo  Server stopped normally.
echo.
pause
exit /b 0

:try_find
if defined NODE_EXE exit /b 0
if exist "%~1" set "NODE_EXE=%~1"
exit /b 0

:fail
echo  Press any key to close this window...
pause >nul
exit /b 1
`,
  'utf8',
)

writeFileSync(
  join(OUT_DIR, 'README-部署.md'),
  readFileSync(join(here, 'release-readme.md'), 'utf8').replace('__VERSION__', VERSION),
  'utf8',
)
/* ---------- 5. 打包成 zip ---------- */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'

const zipName = `londinium-protocol-v${VERSION}.zip`
const zipPath = resolve(root, 'release', zipName)

/** Windows 用 Compress-Archive，类 Unix 用 zip；都没有就只留目录 */
function makeZip() {
  try {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Compress-Archive -Path '${join(OUT_DIR, '*')}' -DestinationPath '${zipPath}' -Force`,
        ],
        { stdio: 'ignore' },
      )
    } else {
      execFileSync('zip', ['-rq', zipPath, '.'], { cwd: OUT_DIR, stdio: 'ignore' })
    }
    return true
  } catch {
    return false
  }
}

function dirSize(dir) {
  let total = 0
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    total += st.isDirectory() ? dirSize(p) : st.size
  }
  return total
}

const kb = Math.round(dirSize(OUT_DIR) / 1024)
const zipped = makeZip()

/* ---------- 6. 打印结果 ---------- */
console.log('')
console.log('─'.repeat(56))
console.log(`  发布包已生成  v${VERSION}`)
console.log('─'.repeat(56))
console.log(`  目录    release/londinium-protocol-v${VERSION}/   （${kb} KB）`)
if (zipped) console.log(`  压缩包  release/${zipName}`)
console.log('')
console.log('  部署到服务器：')
console.log('    1) 把目录（或 zip）传到服务器')
console.log('    2) cd 进去，执行 node server.mjs')
console.log('    3) 浏览器打开 http://<服务器IP>:8787/')
console.log('')
console.log('  服务器上不需要 npm install —— ws 已内联进 server.mjs')
console.log('')

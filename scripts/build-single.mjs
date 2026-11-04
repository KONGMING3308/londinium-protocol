/**
 * 把 dist 产物内联成单个 HTML 文件，使双击即可游玩（file:// 下外部 module 会被 CORS 拦截）
 * 用法：node scripts/build-single.mjs <输出文件路径>
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'dist-single/index.html'
const distDir = 'dist'
const assetsDir = join(distDir, 'assets')

const files = readdirSync(assetsDir)
const jsFile = files.find((f) => f.endsWith('.js'))
const cssFile = files.find((f) => f.endsWith('.css'))
if (!jsFile) throw new Error('未找到 JS 产物，请先运行 npm run build')

const rawJs = readFileSync(join(assetsDir, jsFile), 'utf8')
const rawCss = cssFile ? readFileSync(join(assetsDir, cssFile), 'utf8') : ''
// 内联到 <script> 时，任何 </script 都会提前闭合标签；JS 里写成 <\/script 等价且安全
const js = rawJs.replace(/<\/script/gi, '<\\/script')
const css = rawCss.replace(/<\/style/gi, '<\\/style')

let html = readFileSync(join(distDir, 'index.html'), 'utf8')
html = html
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/, () => `<script type="module">\n${js}\n</script>`)
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)

if (!html.includes('<script type="module">')) throw new Error('内联脚本失败：未匹配到 script 标签')
writeFileSync(out, html, 'utf8')
console.log(`已生成单文件版本：${out}（${(html.length / 1024).toFixed(1)} kB）`)

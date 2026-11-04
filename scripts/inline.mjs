/**
 * 把 dist 打成一个不依赖服务器的单文件 play.html。
 * 用法：npm run build && node scripts/inline.mjs
 * 生成的文件可直接双击（file:// 打开），存档仍走浏览器 localStorage。
 */
import fs from 'node:fs'

const html = fs.readFileSync('dist/index.html', 'utf8')
const files = fs.readdirSync('dist/assets')
const jsName = files.find((f) => f.endsWith('.js'))
const cssName = files.find((f) => f.endsWith('.css'))
if (!jsName || !cssName) {
  console.error('dist/assets 里没找到 js/css 产物，先跑 npm run build')
  process.exit(1)
}

const js = fs.readFileSync(`dist/assets/${jsName}`, 'utf8').replace(/<\/script/gi, '<\/script')
const css = fs.readFileSync(`dist/assets/${cssName}`, 'utf8')

let out = html
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>\s*/g, '')
out = out.replace('</head>', `<style>${css}</style></head>`)
out = out.replace('</body>', `<script type="module">${js}</script></body>`)

fs.writeFileSync('play.html', out)
console.log(`play.html 已生成：${(out.length / 1024).toFixed(0)} KB`)

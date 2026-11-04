/**
 * 把 dist 打成一个不依赖服务器的单文件 play.html。
 * 用法：npm run build && node scripts/inline.mjs
 * 生成的文件可直接双击（file:// 打开），存档仍走浏览器 localStorage。
 *
 * ⚠️ 这里必须用「函数形式」的 replace 回调：
 * 若直接把 js 作为替换字符串传入，代码里的 `$&`、`$'`、`$1` 等序列会被
 * String.prototype.replace 解释为「插入匹配内容」，把 `</body>` 塞进 JS 源码里，
 * 导致语法错误、页面白屏（曾因此产出过打不开的包）。
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

const js = fs.readFileSync(`dist/assets/${jsName}`, 'utf8').replace(/<\/script/gi, '<\\/script')
const css = fs.readFileSync(`dist/assets/${cssName}`, 'utf8')

let out = html
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>\s*/g, '')

// 关键：用回调，避免代码中的 $ 序列被当作替换模式
out = out.replace('</head>', () => `<style>${css}</style></head>`)
out = out.replace('</body>', () => `<script type="module">${js}</script></body>`)

// 自检：JS 里若混入 HTML 标签碎片，说明替换方式又出问题了
const suspicious = out.match(/&&<\/(body|html)>|&&<style>/g)
if (suspicious) {
  console.error('打包失败：JS 中被写入了 HTML 标签碎片 ->', suspicious.slice(0, 3))
  process.exit(1)
}

fs.writeFileSync('play.html', out)

// 导出内联脚本，交给 node --check 做语法校验
const m = out.match(/<script type="module">([\s\S]*)<\/script>/)
if (!m) {
  console.error('打包失败：找不到内联 script')
  process.exit(1)
}
fs.writeFileSync('.inline-check.mjs', m[1])

console.log(`play.html 已生成：${(out.length / 1024).toFixed(0)} KB`)
console.log(`内联 JS ${(js.length / 1024).toFixed(0)} KB / CSS ${(css.length / 1024).toFixed(0)} KB`)
console.log('已导出 .inline-check.mjs，请运行 node --check 校验语法')

/**
 * 从 package.json 同步版本信息到静态资源，供外部软件直接 GET。
 * 生成：public/version.json、public/version.txt
 * 由 npm 的 predev / prebuild 自动调用，也可以手动 npm run version:sync。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const info = {
  name: pkg.name,
  displayName: '伦蒂尼姆协议',
  version: pkg.version,
  versionLabel: `v${pkg.version}`,
}

mkdirSync(resolve(root, 'public'), { recursive: true })
writeFileSync(resolve(root, 'public/version.json'), JSON.stringify(info, null, 2) + '\n', 'utf8')
writeFileSync(resolve(root, 'public/version.txt'), `${info.versionLabel}\n`, 'utf8')
console.log(`[version] 已同步 ${info.versionLabel}（${info.name}）`)

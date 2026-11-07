/**
 * 校验版本信息在各处是否一致，不一致直接以非 0 退出（给 CI 用）。
 * 检查：package.json、public/version.json、public/version.txt、index.html(构建产物若存在)
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const expectVersion = pkg.version
const expectLabel = `v${expectVersion}`

const jsonPath = resolve(root, 'public/version.json')
if (!existsSync(jsonPath)) {
  problems.push('缺少 public/version.json（先跑 npm run version:sync）')
} else {
  const info = JSON.parse(readFileSync(jsonPath, 'utf8'))
  if (info.version !== expectVersion) problems.push(`version.json 版本 ${info.version} ≠ package.json ${expectVersion}`)
  if (info.versionLabel !== expectLabel) problems.push(`version.json 标签 ${info.versionLabel} ≠ ${expectLabel}`)
  if (info.name !== pkg.name) problems.push(`version.json 包名 ${info.name} ≠ package.json ${pkg.name}`)
}

const txtPath = resolve(root, 'public/version.txt')
if (!existsSync(txtPath)) {
  problems.push('缺少 public/version.txt（先跑 npm run version:sync）')
} else {
  const txt = readFileSync(txtPath, 'utf8').trim()
  if (txt !== expectLabel) problems.push(`version.txt 内容 ${txt} ≠ ${expectLabel}`)
}

// 构建产物里的 meta 也要对得上（没构建过就跳过）
const distHtml = resolve(root, 'dist/index.html')
if (existsSync(distHtml)) {
  const html = readFileSync(distHtml, 'utf8')
  if (!html.includes(`<meta name="app-version" content="${expectVersion}"`)) {
    problems.push(`dist/index.html 缺少或写错了 app-version meta（期望 ${expectVersion}）`)
  }
}

if (problems.length > 0) {
  console.error('[version] 不一致：')
  problems.forEach((p) => console.error('  - ' + p))
  process.exit(1)
}
console.log(`[version] 一致：${expectLabel}（${pkg.name}）`)

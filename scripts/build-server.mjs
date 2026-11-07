import { build, context } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createAliasPlugin } from './esbuild-alias.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const watch = process.argv.includes('--watch')

const aliasPlugin = createAliasPlugin(root)

const options = {
  entryPoints: [resolve(root, 'server/index.ts')],
  outfile: resolve(root, 'server/dist/index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  minify: false,
  // ws 是运行期依赖，不内联（体积小、有原生可选依赖），其余全部打进产物
  external: ['ws'],
  plugins: [aliasPlugin],
  logLevel: 'info',
  banner: {
    // esbuild 的 ESM 产物里 import.meta.url 可用；这里只补一行说明
    js: '// 由 scripts/build-server.mjs 生成，请勿手工编辑',
  },
}

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('服务端 watch 已启动')
} else {
  await build(options)
  console.log('服务端构建完成 → server/dist/index.mjs')
}

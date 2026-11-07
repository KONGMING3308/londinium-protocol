/**
 * esbuild 的 `@/` 路径别名插件。
 *
 * 提取到独立模块是因为有多个脚本需要它：
 * - `build-server.mjs`（打包服务端）
 * - `test-local.mjs`（把 engine 单独打包出来跑引擎级测试）
 *
 * 这个插件必须手动补扩展名与目录 index，原因见下方注释。
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** 源码后缀优先级：与 vite 的解析顺序保持一致 */
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.json']

/**
 * 把 `@/xxx` 映射到 `<root>/src/xxx`。
 *
 * esbuild 的自定义 onResolve 不会自动补扩展名，也不认目录下的 index——
 * 这里手动补，否则会报 "Could not read from file .../modifiers"。
 */
export function createAliasPlugin(root) {
  return {
    name: 'alias-at',
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        const base = resolve(root, 'src', args.path.slice(2))
        if (existsSync(base) && !existsSync(base + '/')) {
          const asFile = EXTS.map((ext) => base + ext).find((p) => existsSync(p))
          if (asFile) return { path: asFile }
          if (existsSync(base)) return { path: base }
        }
        for (const ext of EXTS) {
          const candidate = base + ext
          if (existsSync(candidate)) return { path: candidate }
        }
        // 目录形式：src/mocks → src/mocks/index.ts
        for (const ext of EXTS) {
          const candidate = resolve(base, 'index' + ext)
          if (existsSync(candidate)) return { path: candidate }
        }
        // 找不到就把原始候选交回给 esbuild，让它给出清晰的报错
        return { path: base, errors: [{ text: `无法解析别名 ${args.path}` }] }
      })
    },
  }
}

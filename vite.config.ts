import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { versionMetaPlugin } from './scripts/version-meta'

/** 版本号的唯一来源：package.json 的 version 字段 */
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf8')) as {
  name: string
  version: string
}

/** 构建时刻，随产物固化，便于判断「跑的是哪一次构建」 */
const BUILD_TIME = new Date().toISOString()

/** 联机服务端地址：开发期由 vite 代理转发 /ws，前端用同源地址即可 */
const SERVER_ORIGIN = process.env.VITE_SERVER_ORIGIN ?? 'http://localhost:8787'

export default defineConfig({
  // 相对路径产物：解压后直接双击 index.html 也能加载资源
  base: './',
  plugins: [react(), versionMetaPlugin(pkg, BUILD_TIME)],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 开发期把 /ws 转给 Node 服务端，前端用同源地址即可，避免跨域与端口硬编码
    proxy: {
      '/ws': {
        target: SERVER_ORIGIN.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
})

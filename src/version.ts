/**
 * 版本信息的唯一运行时来源。
 *
 * 版本号本身只写在 package.json 的 version 字段里，构建期由 vite.config.ts 的 define 注入。
 * 要升版本，只改 package.json 一处，其余通道全部自动跟随：
 *
 * | 读取方 | 通道 |
 * |---|---|
 * | 玩家 | 界面页脚（Shell 底部） |
 * | 浏览器控制台 / 自动化脚本 | `window.__LONDINIUM__` |
 * | 爬虫 / 页面分析 | `<meta name="app-version">`、`<meta name="app-build-time">` |
 * | 静态托管 / 运维 | `/version.json`、`/version.txt` |
 * | 工程侧 / CI | `package.json`、`npm run version:check` |
 */

export const APP_NAME = '伦蒂尼姆协议'
export const APP_SLUG = 'londinium-protocol'

/** 构建期注入；直接跑源码（未经 Vite）时退回占位值，避免 ReferenceError */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev'

export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : 'unknown'

/** 展示用，形如 v0.2.0 */
export const APP_VERSION_LABEL = `v${APP_VERSION}`

export interface VersionInfo {
  name: string
  displayName: string
  version: string
  versionLabel: string
  buildTime: string
}

/** 与 public/version.json 结构保持一致，任何脚本读哪一处都能对上 */
export function versionInfo(): VersionInfo {
  return {
    name: APP_SLUG,
    displayName: APP_NAME,
    version: APP_VERSION,
    versionLabel: APP_VERSION_LABEL,
    buildTime: APP_BUILD_TIME,
  }
}

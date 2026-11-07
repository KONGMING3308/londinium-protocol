/// <reference types="vite/client" />

/** 由 vite.config.ts 的 define 注入，取自 package.json 的 version */
declare const __APP_VERSION__: string

/** 由 vite.config.ts 注入，构建时刻（ISO 8601） */
declare const __APP_BUILD_TIME__: string

interface Window {
  /** 版本信息快照，供浏览器控制台与自动化脚本读取 */
  __LONDINIUM__?: {
    name: string
    displayName: string
    version: string
    versionLabel: string
    buildTime: string
  }
}

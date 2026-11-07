/**
 * 版本 meta 注入逻辑。
 *
 * 抽成独立模块的原因：vite.config.ts 只能被 Vite 加载，测试跑不起来；
 * 抽出后测试脚本可以直接执行同一份实现，验证「构建产物里真的有版本号」。
 */

export interface PkgMeta {
  name: string
  version: string
}

/** 需要注入到 <head> 的 meta 标签 */
export function versionMetaTags(pkg: PkgMeta, buildTime: string): string[] {
  return [
    `<meta name="app-name" content="${pkg.name}" />`,
    `<meta name="app-version" content="${pkg.version}" />`,
    `<meta name="app-build-time" content="${buildTime}" />`,
  ]
}

/** 把版本 meta 插到 </head> 之前 */
export function injectVersionMeta(html: string, pkg: PkgMeta, buildTime: string): string {
  const tags = versionMetaTags(pkg, buildTime)
    .map((t) => `    ${t}`)
    .join('\n')
  return html.replace('</head>', `${tags}\n  </head>`)
}

export function versionMetaPlugin(pkg: PkgMeta, buildTime: string) {
  return {
    name: 'londinium-version-meta',
    transformIndexHtml(html: string): string {
      return injectVersionMeta(html, pkg, buildTime)
    },
  }
}

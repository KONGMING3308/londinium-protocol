/**
 * 用 src/mocks 的真实数据重写设计文档 4.2–4.9 的卡牌表。
 * 用法：node scripts/sync-card-tables.mjs [--check]
 *   --check 只报告差异，不写文件
 */
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createAliasPlugin } from './esbuild-alias.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outdir = mkdtempSync(join(tmpdir(), 'londinium-sync-'))
const outfile = join(outdir, 'mocks.mjs')
await build({
  entryPoints: [resolve(root, 'src/mocks/index.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  plugins: [createAliasPlugin(root)],
})
const M = await import(pathToFileURL(outfile).href)

// 阵营名（mocks/index 不导出 FACTION_MAP，单独打包一次）
const fout = join(outdir, 'factions.mjs')
await build({
  entryPoints: [resolve(root, 'src/mocks/factions.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: fout, logLevel: 'silent',
  plugins: [createAliasPlugin(root)],
})
const F = await import(pathToFileURL(fout).href)

const STAT = { manpower: '人力', supply: '补给', morale: '士气' }
const AXIS = { assault: '强攻', logistics: '补给线', propaganda: '宣传', convert: '转化', intel: '情报', gamble: '冒险' }
const OP = { strike: '`strike` 打击', raid: '`raid` 掠夺', siege: '`siege` 围困', sabotage: '`sabotage` 破坏', incite: '`incite` 策反', expose: '`expose` 揭穿', decisive: '`decisive` 对决', cut: '`cut` 切断' }
/**
 * 指定牌「命中效果」= op 自带效果 + 牌面 effects，同类项合并后渲染。
 * 之前把 OP_HIT 文本与 effects 用「＋」硬拼，会出现「自身士气 +1＋士气+1」这种重复。
 */
const OP_BASE = {
  strike: { self: { morale: 1 }, target: { morale: -4 } },
  raid: { take: 3 },
  siege: { target: { supply: -3 } },
  sabotage: { note: '目标指定牌失效' },
  incite: { note: '解除目标同盟', self: { morale: 1 } },
  expose: { note: '公开目标行动牌', self: { supply: 1 } },
  decisive: { special: '人力差 ≥3 时夺 5 补给、目标士气 -3' },
  cut: { grab: 1 },
}
const addStats = (a = {}, b = {}) => {
  const out = { ...a }
  Object.keys(b).forEach((k) => { out[k] = (out[k] ?? 0) + b[k] })
  return out
}
const hitCol = (c) => {
  const base = OP_BASE[c.op] ?? {}
  const parts = []
  if (base.special) parts.push(base.special)
  if (base.note) parts.push(base.note)
  if (base.target) parts.push(`目标${eff(base.target)}`)
  if (base.take) parts.push(`夺取目标 ${base.take} 补给`)
  if (base.grab) parts.push(`顺走 ${base.grab} 点补给，目标补给收益归零`)
  const selfStats = addStats(base.self, c.effects ?? {})
  if (c.op === 'sabotage') {
    // 条件式：目标有指定牌时自身士气 +1
    parts.push(Object.keys(selfStats).length ? `自身${eff(selfStats)}` : '有指定牌时自身士气 +1')
  } else if (Object.keys(selfStats).length) {
    parts.push(`自身${eff(selfStats)}`)
  }
  return parts.length ? parts.join('，') : '—'
}
const eff = (o) => {
  const keys = ['manpower', 'supply', 'morale']
  const s = keys.filter((k) => o && o[k]).map((k) => `${STAT[k]}${o[k] > 0 ? '+' : ''}${o[k]}`).join('　')
  return s || '—'
}
const costText = (c) => {
  if (!c) return '—'
  const keys = ['manpower', 'supply', 'morale']
  const s = keys.filter((k) => c[k]).map((k) => `${STAT[k]}${-c[k] > 0 ? '+' : ''}${-c[k]}`).join('　')
  return s || '—'
}
const spCol = (c) => {
  const parts = []
  if (c.special) parts.push(`\`${c.special}\``)
  if (c.roll) parts.push(`\`roll ${c.roll.chance}\``)
  return parts.length ? parts.join('＋') : '—'
}
const tagCol = (c) => {
  const parts = []
  if (c.tag) parts.push(`\`tag: ${c.tag}\``)
  if (c.counterTag) parts.push(`\`counterTag: ${c.counterTag}\``)
  if (c.progress && c.owner === 'SARK') parts.push(`进度 +${c.progress}`)
  return parts.length ? parts.join('＋') : '—'
}
const HEAD_ACTION = '| 编号 | 名称 | 战略轴 | 代价 | 效果 | 特殊 |'
const HEAD_DESIG = '| 编号 | 名称 | 回合 | op | 命中效果 | 标签／推进 | 落空反噬 |'
const HEAD_NEUTRAL = '| 编号 | 名称 | 战略轴 | 代价 | 成功率 | 成功效果 | 失败效果 | 特殊 | 需同盟 |'
/** 阵营牌表头是「| 编号 | 名称 | 甲方 · X | 乙方 · Y |」，列名随阵营对变，用前缀匹配 */
const FACTION_PREFIX = '| 编号 | 名称 | 甲方 · '

const FACTIONS = ['SARK', 'VIC', 'RI', 'TARA', 'REU', 'SSC']

const actionTable = (fid) => [
  HEAD_ACTION, '|---|---|---|---|---|---|',
  ...M.FACTION_ACTIONS[fid].map((c) =>
    `| ${c.id} | ${c.name} | ${AXIS[c.axis]} | ${costText(c.cost)} | ${eff(c.effects)} | ${spCol(c)} |`),
].join('\n')

const designatedTable = (fid) => [
  HEAD_DESIG, '|---|---|---|---|---|---|---|',
  ...M.FACTION_DESIGNATED[fid].map((c) =>
    `| ${c.id} | ${c.name} | R${c.round} | ${OP[c.op]} | ${hitCol(c)} | ${tagCol(c)} | ${eff(c.backlash)} |`),
].join('\n')

const spLabel = (c) => {
  const base = c.special ? `\`${c.special}\`` : ''
  if (c.roll) {
    return base ? `${base}（${c.roll.chance}）` : `\`roll ${c.roll.chance}\``
  }
  return base || '—'
}

const neutralTable = () => [
  HEAD_NEUTRAL, '|---|---|---|---|---|---|---|---|---|',
  ...M.GENERIC_CARDS.map((c) => {
    const chance = c.roll ? `${Math.round(c.roll.chance * 100)}%` : '—'
    const win = c.roll ? eff(c.roll.win) : eff(c.effects)
    const lose = c.roll ? eff(c.roll.lose) : '—'
    const sp = c.special ? `\`${c.special}\`` : '—'
    const needAlly = c.requiresAlly ? '是' : '否'
    return `| ${c.id} | ${c.name} | ${AXIS[c.axis]} | ${costText(c.cost)} | ${chance} | ${win} | ${lose} | ${sp} | ${needAlly} |`
  }),
].join('\n')

/** 按「表头出现顺序」逐个替换表格块；match 可以是完整行或前缀 */
function replaceTables(lines, match, tables, label) {
  let idx = 0
  const out = []
  let i = 0
  let replaced = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line === match || line.startsWith(match)) {
      let j = i
      while (j < lines.length && lines[j].trim().startsWith('|')) j += 1
      if (idx < tables.length) {
        out.push(...tables[idx].split('\n'))
        replaced += 1
      } else {
        out.push(...lines.slice(i, j))
      }
      idx += 1
      i = j
      continue
    }
    out.push(lines[i])
    i += 1
  }
  console.error(`[${label}] 表头出现 ${idx} 次，替换 ${replaced} 个`)
  return out
}

const docPath = resolve(root, 'docs/伦蒂尼姆协议-完整设计文档.md')
const raw = readFileSync(docPath, 'utf8')
let lines = raw.split('\n')

lines = replaceTables(lines, HEAD_ACTION, FACTIONS.map(actionTable), '行动牌')
lines = replaceTables(lines, HEAD_DESIG, FACTIONS.map(designatedTable), '指定牌')
lines = replaceTables(lines, HEAD_NEUTRAL, [neutralTable()], '中立援助')

// 阵营牌：按文档 4.9.1–4.9.6 的实际顺序替换（不是字母序）
const groups = {}
M.FACTION_CARDS.forEach((c) => {
  const key = (c.pair ?? []).slice().sort().join('+')
  ;(groups[key] = groups[key] ?? []).push(c)
})
const pairOrder = [
  ['SARK', 'TARA'],
  ['VIC', 'RI'],
  ['VIC', 'SSC'],
  ['RI', 'REU'],
  ['RI', 'SSC'],
  ['REU', 'SSC'],
]
const NAME = (id) => (F.FACTION_MAP?.[id]?.name ?? id)
const factionTables = pairOrder.map((p) => {
  const key = p.slice().sort().join('+')
  const cards = groups[key] ?? []
  const head = `| 编号 | 名称 | 甲方 · ${NAME(p[0])} | 乙方 · ${NAME(p[1])} |`
  const body = cards.map((c) => {
    const aParts = [eff(c.effects)]
    if (c.progress) aParts.push(`**战争进度+${c.progress}**`)
    const bParts = [eff(c.allyEffects)]
    if (c.allyProgress) bParts.push(`**战争进度+${c.allyProgress}**`)
    return `| ${c.id} | ${c.name} | ${aParts.join('　')} | ${bParts.join('　')} |`
  })
  return [head, '|---|---|---|---|', ...body].join('\n')
})
lines = replaceTables(lines, FACTION_PREFIX, factionTables, '阵营牌')

const next = lines.join('\n')
if (process.argv.includes('--check')) {
  console.log(next === raw ? '卡牌表已与代码一致' : '卡牌表存在差异')
} else {
  writeFileSync(docPath, next)
  console.log('已写回 docs/伦蒂尼姆协议-完整设计文档.md')
}
rmSync(outdir, { recursive: true, force: true })

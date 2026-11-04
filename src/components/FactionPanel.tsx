import { FACTION_MAP } from '@/mocks/factions'
import type { FactionId, PlayerState } from '@/types'
import { StatBar } from './StatBar'

/**
 * 每个阵营的「关键道具」= 相关胜利条件的硬前提。
 * 只在需要打出 KEY 牌才能获胜的三个阵营显示；萨卡兹靠战争进度、罗德岛与市民自救军不依赖 KEY。
 */
const KEY_OF: Partial<Record<FactionId, string>> = {
  VIC: '国剑',
  TARA: '塔拉独立',
  REU: '新纲领',
}

interface Props {
  player: PlayerState
  highlight?: boolean
  compact?: boolean
}

export function FactionPanel({ player, highlight, compact }: Props) {
  const faction = FACTION_MAP[player.factionId]
  const flags = [
    player.exiled ? '流亡' : null,
    player.defeated ? '出局' : null,
    player.allyId ? '结盟中' : null,
  ].filter(Boolean)

  const keyName = KEY_OF[player.factionId]
  const hasKey = keyName ? player.keyTags?.includes(keyName) : false
  const keyLost = keyName ? player.nullifiedTags.includes(keyName) : false

  return (
    <div
      className={`rounded-lg border bg-gradient-to-br p-3 ${faction.accent} ${
        highlight ? 'border-amber-400/70' : 'border-white/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">{player.name}</p>
          <p className="font-display text-sm text-white">{faction.name}</p>
        </div>
        <div className="flex gap-1">
          {flags.map((f) => (
            <span key={f} className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-amber-200">
              {f}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <StatBar stats={player.stats} compact={compact} />
      </div>
      {player.factionId === 'SARK' && (
        <p className="mt-2 text-[10px] text-rose-200/80">战争进度 {player.warProgress} / 3</p>
      )}
      {keyName && (
        <p
          className={`mt-2 text-[10px] ${
            keyLost ? 'text-rose-300' : hasKey ? 'text-emerald-200' : 'text-white/45'
          }`}
        >
          {keyLost
            ? `【${keyName}】已被击穿 · 无法获胜`
            : hasKey
              ? `已握有【${keyName}】`
              : `尚未获得【${keyName}】`}
        </p>
      )}
    </div>
  )
}

/**
 * 结算页（联机版）：数值、日志、胜负与同盟交换。
 *
 * 与热座版的差别
 * - 没有「把设备交给这对同盟」：每对同盟在自己的屏幕上并行拍板，
 *   服务端只把「我这对」的候选牌发给我（match.faction），别人的候选看不到。
 * - 「进入下一回合」变成 readyNext：四人各自就绪后由服务端推进回合。
 * - 已谈成的条款不在本页摊开：只告诉同盟双方「谈成了，下回合生效」，
 *   具体收益会在下回合开始时由服务器写进日志。
 *
 * 本地 useState 只用于「已发出、等快照」的空窗提示，任何权威状态都以 match / room 为准。
 */
import { useEffect, useState } from 'react'
import { Handshake, Lock, ScrollText } from 'lucide-react'
import { useRoomStore } from '@/store/roomStore'
import { FACTION_MAP } from '@/mocks/factions'
import { describeStoryEvent } from '@/utils/game/story'
import { describePactEvent } from '@/utils/game/pact'
import { Button } from '@/components/Button'
import { CardTile } from '@/components/CardTile'
import { FactionPanel } from '@/components/FactionPanel'
import { LogList } from '@/components/LogList'
import type { PlayerState } from '@/types'

export function ResolvePage() {
  const room = useRoomStore((s) => s.room)
  const match = useRoomStore((s) => s.match)
  const playerId = useRoomStore((s) => s.playerId)
  const factionPick = useRoomStore((s) => s.factionPick)
  const readyNext = useRoomStore((s) => s.readyNext)
  const lastError = useRoomStore((s) => s.lastError)

  // 本地只记录「已发出、等快照」的空窗；权威状态一律以快照为准。
  // 这两个标记跟「当前操作者」绑定：本地热座模式切换操作者后必须清空，
  // 否则上一个人点过的「进入下一回合」会把下一个人的按钮一直锁住。
  const [pickSent, setPickSent] = useState(false)
  const [nextSent, setNextSent] = useState(false)

  // 切换操作者（本地热座）时，这些「我刚点过」的标记属于上一个人，必须重置
  useEffect(() => {
    setPickSent(false)
    setNextSent(false)
  }, [playerId])

  // 服务端报错（例如「这对同盟本回合已经拍板了」）时回退本地标记，允许重试
  useEffect(() => {
    if (lastError) {
      setPickSent(false)
      setNextSent(false)
    }
  }, [lastError])

  // 回合切换、或我这对的拍板结果已落进快照时，清掉空窗标记
  const pickPhaseKey = `${match?.round ?? 0}-${match?.faction.canPick ? 'open' : 'done'}`
  useEffect(() => {
    setPickSent(false)
  }, [pickPhaseKey])

  if (!match) return null

  const winner = match.winner ? FACTION_MAP[match.winner].name : null
  const selfWon = Boolean(match.winner) && match.winner === match.self.factionId
  /** 终局：已有胜者，或打到最后一回合 */
  const final = Boolean(match.winner) || match.round >= match.maxRound

  const seats = room?.seats ?? []
  const mySeat = seats.find((s) => s.playerId === playerId)
  const readyCount = seats.filter((s) => s.readyNext).length
  // 已出局者不参与推进，不进分母；否则会出现永远凑不满的 4/4
  const activeSeatCount = match.players.filter((p) => !p.defeated).length || seats.length
  // 快照把我的 readyNext 置真后按钮就彻底锁住；nextSent 只覆盖快照到达前的空窗
  const alreadyReady = Boolean(mySeat?.readyNext) || nextSent

  const faction = match.faction
  const offers = faction.offers
  const ally = match.self.allyId
    ? match.players.find((p) => p.id === match.self.allyId) ?? null
    : null
  /** 服务端说我这对还能拍板，且候选牌还在 */
  const canPickNow = faction.canPick && offers.length > 0
  /** 我已经点过候选，正等快照落地 */
  const awaitingPick = pickSent && canPickNow
  /** 我这对已经拍板（服务端说不能再选，且不是因为没候选牌） */
  const myPairDecided = Boolean(ally) && !faction.canPick
  /** 有同盟但本回合根本没有交换牌（例如最后一回合不再发牌） */
  const allyButNoOffers = Boolean(ally) && faction.canPick && offers.length === 0

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70">
          第 {match.round} / {match.maxRound} 回合 · 结算
        </p>
        {match.storyEvent ? (
          <div data-testid="resolve-story">
            <h2 className="font-display text-xl text-slate-100">
              剧情【{match.storyEvent.label}】：{match.storyEvent.story}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
              本回合剧情影响：{describeStoryEvent(match.storyEvent)}
            </p>
          </div>
        ) : (
          <h2 className="font-display text-xl text-slate-100">本回合结算</h2>
        )}
        {match.pactEvent ? (
          <div className="mt-2 text-xs leading-relaxed text-fuchsia-200">
            <p>
              盟约事件【{match.pactEvent.name}】：{match.pactEvent.text}
            </p>
            <p className="mt-1 text-fuchsia-100/80">{describePactEvent(match.pactEvent)}</p>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            本回合盟约事件未触发。
          </p>
        )}
      </div>

      {winner && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300">终局胜负</p>
          <h3 className="font-display text-2xl text-amber-100">{winner} 获胜</h3>
          <p className="mt-1 text-sm leading-relaxed text-amber-200/80">{match.winnerReason}</p>
          {selfWon && <p className="mt-2 text-xs text-amber-100">胜者就是你。</p>}
        </div>
      )}

      {match.bidResults.length > 0 && (
        <div
          className="rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-4"
          data-testid="resolve-bids"
        >
          <p className="text-xs text-emerald-200">中立资源争夺结果</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            结算前各自的出价是保密的，现在公开。出价最高者独得，其余人的出价一律不退。
          </p>
          <div className="mt-2 space-y-2">
            {match.bidResults.map((r) => (
              <div
                key={r.pointId}
                className="rounded border border-white/10 bg-slate-950/40 p-2.5"
                data-testid={`bid-result-${r.pointId}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs text-slate-200">{r.pointName}</p>
                  {r.winnerId ? (
                    <p className="text-[11px] text-emerald-300">
                      {r.winnerId === match.self.id ? '你' : r.winnerName} 以 {r.winningBid} 补给夺得
                    </p>
                  ) : r.tied ? (
                    <p className="text-[11px] text-rose-300">
                      最高价并列 {r.winningBid} → 流拍，出价照扣
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500">无人出价，流拍</p>
                  )}
                </div>
                {r.bids.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.bids.map((b) => (
                      <span
                        key={b.playerId}
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          b.playerId === r.winnerId
                            ? 'bg-emerald-400/20 text-emerald-200'
                            : 'bg-white/5 text-slate-400'
                        }`}
                      >
                        {b.playerId === match.self.id ? '你' : b.name} 出 {b.amount}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        {match.players.map((p) => {
          // 公开视图不含保留牌与保留回合，这里补 null 只为满足 FactionPanel 的类型
          const view: PlayerState = { ...p, heldDesignated: null, heldKeptRound: null }
          return (
            <FactionPanel
              key={p.id}
              player={view}
              highlight={p.id === match.self.id}
              compact
            />
          )
        })}
      </div>

      {/* 同盟交换：候选牌只有我这对同盟的两人能看到；没有同盟就只说明一句 */}
      {ally ? (
        <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-fuchsia-200">
              <Lock className="h-3.5 w-3.5" />
              同盟交换 · 条款下回合开始前生效
            </p>
            <p className="text-[10px] text-slate-500">
              {faction.pendingPairs > 0
                ? `全场还有 ${faction.pendingPairs} 对同盟未拍板`
                : '全场同盟均已完成拍板'}
            </p>
          </div>

          <p className="mb-3 text-[11px] text-slate-400">
            你的同盟：{ally.name}（{FACTION_MAP[ally.factionId].name}）
            <span className="ml-1 text-slate-600">· 候选牌只有你们两人能看到</span>
          </p>

        {/* 我这对还能拍板：两张候选 + 这回合不谈 */}
        {canPickNow && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {offers.map((card, i) => (
                <div key={card.id} className="space-y-1">
                  <p className="px-1 text-[10px] text-slate-500">候选 {i + 1}</p>
                  <CardTile
                    card={card}
                    compact
                    disabled={awaitingPick}
                    onClick={() => {
                      if (awaitingPick) return
                      factionPick(card.id)
                      setPickSent(true)
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                disabled={awaitingPick}
                data-testid="faction-no-deal"
                onClick={() => {
                  if (awaitingPick) return
                  factionPick(null)
                  setPickSent(true)
                }}
              >
                这回合不谈
              </Button>
              <p className="text-[10px] leading-relaxed text-slate-500">
                选 1 张即成交，两边同时结算；谈成的内容会在下回合开始时由日志公布。
              </p>
            </div>
          </div>
        )}

        {/* 已发出、等快照：不再重复展示候选，避免误以为还能改 */}
        {awaitingPick && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-200">
            <Handshake className="h-3.5 w-3.5" />
            已拍板，等待服务器确认…
          </p>
        )}

        {/* 有同盟但本回合没有发放交换牌 */}
        {allyButNoOffers && (
          <p className="text-[11px] text-slate-400">本回合没有同盟交换。</p>
        )}

        {/* 我这对已拍板：只告知结果，绝不摊开具体收益 */}
        {myPairDecided && (
          <div className="space-y-1">
            {faction.picked ? (
              <>
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-200">
                  <Handshake className="h-3.5 w-3.5" />
                  本回合已谈成（条款下回合生效）。
                </p>
                <p className="text-[10px] leading-relaxed text-slate-600">
                  具体收益会在下回合开始时公布，届时对你的同盟同样生效。
                </p>
              </>
            ) : (
              <p className="text-[11px] text-slate-400">本回合已拍板（这回合不谈）。</p>
            )}
          </div>
        )}
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
          <p className="text-[11px] text-slate-400">
            本回合没有同盟交换——你没有同盟，无法与任何人谈条件。
          </p>
          {faction.pendingPairs > 0 && (
            <p className="mt-1 text-[10px] text-slate-600">
              场上还有其他同盟对在谈，但那是他们两人的事，你看不到他们的候选。
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
          <ScrollText className="h-3.5 w-3.5" />
          本回合结算
        </p>
        <LogList logs={match.roundLog} />
      </div>

      <Button
        full
        disabled={alreadyReady}
        data-testid="ready-next"
        onClick={() => {
          setNextSent(true)
          readyNext()
        }}
      >
        {alreadyReady
          ? `已准备，等待其他玩家（${readyCount} / ${activeSeatCount}）`
          : final
            ? '查看最终结算'
            : `进入第 ${match.round + 1} 回合`}
      </Button>
      {alreadyReady && (
        <p className="text-center text-[10px] text-slate-500">
          未出局的玩家全部点「进入下一回合」后，服务器才会推进
          {final ? '到最终结算。' : '并发出新牌。'}
        </p>
      )}
      {final && !alreadyReady && (
        <p className="text-center text-[10px] text-slate-500">
          对局已到终局判定点，点击即可查看最终结算。
        </p>
      )}
    </section>
  )
}

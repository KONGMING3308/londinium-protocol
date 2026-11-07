/**
 * 联机版盟约窗口：提议 → 对方同意 → 成盟，不能单方面建立。
 *
 * 视角约束
 * - `match.council` 只下发「与我相关」的请求（incoming / outgoing），
 *   全桌的请求队列不给我们看，所以这里不展示别人的待处理提议。
 * - 同盟关系本身是公开信息（`match.players[].allyId`），可以照实画出来。
 * - 阵营交换候选（faction.offers）只在结算页展示，盟约窗口不提前剧透。
 *
 * 按钮可用性对齐服务端 councilAllyRequest 的校验：
 * 自己已有同盟 / 已背刺过 / 对方已有同盟或已背刺 / 阵营不可结盟 / 同盟已达 2 对 → 不可发起。
 *
 * 状态约定
 * - 权威状态一律来自快照（council.ready / council.incoming / council.outgoing）。
 * - 本地 useState 只用来在「已发出、快照还没回来」的空窗里挡住重复提交；
 *   `rejectTick` 变化说明服务端拒绝过上一次操作，此时解除本地锁让玩家重试。
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { FactionPanel } from '@/components/FactionPanel'
import { canAlly, FACTION_MAP } from '@/mocks/factions'
import { useRoomStore } from '@/store/roomStore'
import type { CouncilView, PublicPlayer, SelfView } from '@/shared/protocol'

/** 服务端允许的同盟上限（与 engine 里的 MAX_ALLIANCE_PAIRS 一致） */
const MAX_ALLIANCE_PAIRS = 2

interface Props {
  self: SelfView
  players: PublicPlayer[]
  council: CouncilView
  /** 未出局玩家中已就绪的人数（出局者不参与推进，不能算进分母） */
  readyCount: number
  /** 未出局玩家总数 */
  activeCount: number
  /** 服务端每一次报错都会让它自增，用于解除本地锁 */
  rejectTick: number
  onRequest: (targetId: string) => void
  onRespond: (fromId: string, accept: boolean) => void
  onBreak: () => void
  onReady: () => void
}

export function CouncilPanel({
  self,
  players,
  council,
  readyCount,
  activeCount,
  rejectTick,
  onRequest,
  onRespond,
  onBreak,
  onReady,
}: Props) {
  const [confirmBreak, setConfirmBreak] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [responded, setResponded] = useState(false)
  const [breakSent, setBreakSent] = useState(false)

  // 切换操作者（本地热座）时，上一个人的提议/回应/解除标记必须清空，
  // 否则下一个人会继承上一个的锁定状态，看起来像「点了没反应」。
  const playerId = useRoomStore((s) => s.playerId)
  useEffect(() => {
    setConfirmBreak(false)
    setRequestSent(false)
    setResponded(false)
    setBreakSent(false)
  }, [playerId])

  // 服务端拒绝过上一次操作 → 解除本地锁，让玩家可以改主意重试
  useEffect(() => {
    if (rejectTick > 0) {
      setRequestSent(false)
      setResponded(false)
      setBreakSent(false)
    }
  }, [rejectTick])

  // 状态真值全部来自快照
  const isReady = council.ready
  const incoming = council.incoming
  const outgoing = council.outgoing

  const allyPairs = players.filter((p) => p.allyId)
  const pairCount = allyPairs.length / 2
  const myAlly = self.allyId ? players.find((p) => p.id === self.allyId) ?? null : null

  /** 可发起结盟的前提：自己无同盟、未背刺、未出局，且同盟未满 */
  const canRequest =
    !self.allyId && !self.betrayed && !self.defeated && pairCount < MAX_ALLIANCE_PAIRS
  const candidates = canRequest
    ? players.filter(
        (p) =>
          p.id !== self.id &&
          !p.defeated &&
          !p.allyId &&
          !p.betrayed &&
          canAlly(self.factionId, p.factionId),
      )
    : []

  const nameOf = (id: string): string => players.find((p) => p.id === id)?.name ?? '未知玩家'
  const factionOf = (id: string): string => {
    const p = players.find((o) => o.id === id)
    return p ? FACTION_MAP[p.factionId].name : ''
  }

  const canPressReady = !isReady && !self.defeated

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/5 p-4">
        <p className="text-sm text-slate-200">四人已提交选牌，进入盟约窗口。</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          这是本回合最后的盟约机会：结盟需要对方同意，撕毁会立即解除同盟——本回合的同盟互援与同盟类加成
          一并失效，只有背刺加成照常结算，并且撕毁者永久失去结盟资格。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {players.map((p) => (
          <FactionPanel
            key={p.id}
            player={{ ...p, heldDesignated: null, heldKeptRound: null }}
            highlight={p.id === self.id}
            compact
          />
        ))}
      </div>

      {/* 收到的结盟请求：快照只把发给我的那一条给我 */}
      {incoming && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-100">
            {incoming.fromName}（{factionOf(incoming.fromId)}）请求与你结盟
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
            同意后你们立即互为同盟，本回合起享受同盟互援；拒绝则这条提议作废。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={responded}
              onClick={() => {
                onRespond(incoming.fromId, true)
                setResponded(true)
              }}
            >
              同意结盟
            </Button>
            <Button
              variant="ghost"
              disabled={responded}
              onClick={() => {
                onRespond(incoming.fromId, false)
                setResponded(true)
              }}
            >
              拒绝
            </Button>
          </div>
          {responded && (
            <p className="mt-2 text-[10px] text-slate-400">已回应，等待服务器确认…</p>
          )}
        </div>
      )}

      {/* 我发出的请求 */}
      {outgoing && (
        <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 p-4">
          <p className="text-sm text-sky-100">
            已向 {outgoing.toName}（{factionOf(outgoing.toId)}）发出结盟请求，等待回应…
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            对方同意后同盟立即成立；在对方回应之前你可以先点「我准备好了」。
          </p>
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4">
        <p className="text-xs text-slate-400">
          当前同盟状态（{pairCount} / {MAX_ALLIANCE_PAIRS} 对）
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {allyPairs.map((p) => {
            const mine = p.id === self.id || p.allyId === self.id
            return (
              <span
                key={p.id}
                className={`rounded px-2 py-1 text-[11px] ${
                  mine ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-slate-400'
                }`}
              >
                {p.name} ↔ {nameOf(p.allyId ?? '')}
                {mine && '（我）'}
              </span>
            )
          })}
          {pairCount === 0 && <span className="text-[11px] text-slate-600">尚无同盟</span>}
        </div>

        {/* 我自己的同盟：可以撕毁 */}
        {myAlly && (
          <div className="mt-3 rounded border border-rose-400/30 bg-rose-500/5 p-3">
            <p className="text-[11px] text-rose-200">
              你当前与 {myAlly.name}（{FACTION_MAP[myAlly.factionId].name}）同盟。
            </p>
            {confirmBreak ? (
              <div className="mt-2 space-y-2">
                <p className="text-[10px] leading-relaxed text-rose-200/80">
                  撕毁后立即解除同盟、本回合同盟加成失效，且你永久失去结盟资格。确定吗？
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="danger"
                    disabled={breakSent}
                    onClick={() => {
                      onBreak()
                      setBreakSent(true)
                    }}
                  >
                    {breakSent ? '已发出，等待服务器确认…' : '确认撕毁盟约'}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmBreak(false)}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="danger" className="mt-2" onClick={() => setConfirmBreak(true)}>
                撕毁盟约
              </Button>
            )}
          </div>
        )}

        {/* 发起结盟 */}
        <div className="mt-4">
          <p className="text-[11px] text-slate-400">发起结盟</p>
          {!canRequest && (
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              {self.defeated
                ? '你已出局，无法结盟。'
                : self.betrayed
                  ? '你已撕毁过盟约，永久失去结盟资格。'
                  : self.allyId
                    ? '你已经在同盟中，需要先撕毁现有盟约才能另结。'
                    : `同盟已达上限（${MAX_ALLIANCE_PAIRS} 对）。`}
            </p>
          )}
          {canRequest && candidates.length === 0 && (
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              当前没有可结盟的对象：对方需无同盟、未背刺，且双方阵营历史上可合作。
            </p>
          )}
          {canRequest && candidates.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {candidates.map((p) => (
                <Button
                  key={p.id}
                  variant="ghost"
                  disabled={Boolean(outgoing) || requestSent}
                  onClick={() => {
                    onRequest(p.id)
                    setRequestSent(true)
                  }}
                >
                  向 {p.name}（{FACTION_MAP[p.factionId].name}）提出结盟
                </Button>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            仅剧情中实际合作过的势力可结盟，敌对势力永不结盟。同一时间只能有一个待回应的提议。
          </p>
        </div>
      </div>

      <Button full disabled={!canPressReady} onClick={onReady} data-testid="council-ready">
        {isReady ? `已就绪，等待其他玩家（${readyCount} / ${activeCount}）` : '我准备好了'}
      </Button>
      {!isReady && (
        <p className="text-center text-[10px] text-slate-500">
          未出局的玩家全部就绪后本回合结算；还没谈完的同盟交换可以留到结算页继续。
        </p>
      )}
    </section>
  )
}

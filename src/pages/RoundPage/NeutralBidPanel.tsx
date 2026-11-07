/**
 * 中立资源竞标面板：四人暗选时各自秘密出价，最高价独得。
 *
 * 为什么单独一个组件
 * ------------------
 * 暗选面板本身已经很长（行动牌 / 中立援助 / 指定牌），
 * 竞标是独立的一套决策（选目标 + 定金额），塞进去会让人找不到重点。
 * 抽出来之后也能单独测试，并且保证「出价」与「打牌」在视觉上被清楚区分：
 * 打牌是这回合的主业，抢点是额外的赌注。
 */
import { useState } from 'react'
import { Button } from '@/components/Button'
import { describeReward } from '@/utils/game/bid'
import type { Bid, NeutralPointDef } from '@/types'

interface Props {
  points: NeutralPointDef[]
  /** 已提交的出价（重连回来时回显） */
  myBid: Bid | null
  /** 已提交出价的人数，用于「有几个人下手了」的提示 */
  bidCount: number
  /** 当前补给，用于提示「出完还剩多少」 */
  supply: number
  blocked: boolean
  onChange: (bid: { pointId: string; amount: number } | null) => void
}

export function NeutralBidPanel({ points, myBid, bidCount, supply, blocked, onChange }: Props) {
  const [pointId, setPointId] = useState<string>(myBid?.pointId ?? '')
  const [amount, setAmount] = useState<string>(myBid ? String(myBid.amount) : '')

  if (points.length === 0) return null

  const selected = points.find((p) => p.id === pointId) ?? null
  const parsed = Number(amount)
  const numeric = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
  const tooLow = Boolean(selected) && numeric > 0 && numeric < selected!.minBid
  const overspend = numeric > supply
  const valid = Boolean(selected) && numeric >= selected!.minBid

  const emit = (nextPointId: string, nextAmount: string) => {
    const n = Number(nextAmount)
    const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
    const pt = points.find((p) => p.id === nextPointId) ?? null
    if (!pt || v < pt.minBid) {
      onChange(null)
      return
    }
    onChange({ pointId: nextPointId, amount: v })
  }

  return (
    <div
      className="rounded-lg border border-emerald-400/25 bg-emerald-500/5 p-4"
      data-testid="neutral-bid-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-emerald-200">中立资源争夺</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            每回合刷出 {points.length} 个中立资源，四人同时秘密出价。
            <span className="text-slate-300">出价最高者独得，其余人的出价一律不退</span>
            ；最高价并列则流拍，谁都不拿——出价照扣。
          </p>
        </div>
        <span className="rounded bg-white/5 px-2 py-1 text-[10px] text-slate-400">
          已有 {bidCount} 人出价
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {points.map((p) => {
          const active = p.id === pointId
          return (
            <button
              key={p.id}
              type="button"
              disabled={blocked}
              onClick={() => {
                const next = active ? '' : p.id
                setPointId(next)
                emit(next, amount)
              }}
              className={`rounded border p-2.5 text-left transition ${
                active
                  ? 'border-emerald-400/70 bg-emerald-400/10'
                  : 'border-white/10 bg-slate-950/40 hover:border-emerald-400/40'
              } ${blocked ? 'cursor-not-allowed opacity-50' : ''}`}
              data-testid={`bid-point-${p.id}`}
            >
              <p className="text-xs text-slate-200">{p.name}</p>
              <p className="mt-0.5 text-[11px] text-emerald-300">{describeReward(p.reward)}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{p.flavor}</p>
              <p className="mt-1 text-[10px] text-amber-300/80">最低出价 {p.minBid}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-500">我的出价（从补给扣，输了不退）</span>
          <input
            type="number"
            min={0}
            max={99}
            value={amount}
            disabled={blocked || !pointId}
            onChange={(e) => {
              setAmount(e.target.value)
              emit(pointId, e.target.value)
            }}
            className="w-24 rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 disabled:opacity-40"
            data-testid="bid-amount"
          />
        </label>
        <Button
          variant="ghost"
          disabled={blocked || !pointId}
          onClick={() => {
            setPointId('')
            setAmount('')
            onChange(null)
          }}
          data-testid="bid-clear"
        >
          不参与争夺
        </Button>
        <p className="text-[10px] leading-relaxed text-slate-500">
          {!pointId
            ? '本回合不抢（出价为 0）'
            : tooLow
              ? `低于最低出价 ${selected!.minBid}，等同不参与`
              : valid
                ? `出 ${numeric}，结算后剩 ${supply - numeric} 补给${overspend ? '（透支，可能崩溃）' : ''}`
                : '还没出价'}
        </p>
      </div>

      {overspend && (
        <p className="mt-2 rounded border border-rose-400/30 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-200">
          出价超过当前补给（{supply}），结算后会被扣成负数，极可能当场崩溃。确认你要这么赌。
        </p>
      )}
    </div>
  )
}

/**
 * 回合页：按 phase 切换 交接 / 暗选 / 盟约 三种面板
 * 依赖：gameStore、RoundPage/ 下的三个面板
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/gameStore'
import { HandoffPanel } from './HandoffPanel'
import { PickingPanel } from './PickingPanel'
import { CouncilPanel } from './CouncilPanel'

export function RoundPage() {
  const game = useGameStore((s) => s.game)
  const beginPick = useGameStore((s) => s.beginPick)
  const submitPick = useGameStore((s) => s.submitPick)
  const resolve = useGameStore((s) => s.resolve)
  const formAlliance = useGameStore((s) => s.formAlliance)
  const breakAlliance = useGameStore((s) => s.breakAlliance)
  const navigate = useNavigate()

  useEffect(() => {
    if (!game) {
      navigate('/')
      return
    }
    if (game.phase === 'resolved') navigate('/resolve')
    if (game.phase === 'result') navigate('/result')
    if (game.phase === 'briefing') navigate('/briefing')
  }, [game, game?.phase, navigate])

  const player = game ? game.players[game.activeIndex] : null

  if (!game) return null

  // 盟约阶段 activeIndex 已越过最后一名玩家，不能再要求 player 存在
  if (game.phase === 'council') {
    return (
      <CouncilPanel
        game={game}
        onForm={formAlliance}
        onBreak={breakAlliance}
        onResolve={resolve}
      />
    )
  }

  if (!player) return null

  if (game.phase === 'handoff') {
    return <HandoffPanel player={player} round={game.round} onReady={() => beginPick(game.activeIndex)} />
  }

  if (game.phase === 'picking') {
    return (
      <PickingPanel
        key={`${game.round}-${game.activeIndex}`}
        player={player}
        players={game.players}
        hand={game.hand}
        round={game.round}
        onSubmit={submitPick}
      />
    )
  }

  return null
}

import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { useGameStore } from '@/store/gameStore'
import { SetupPage } from '@/pages/SetupPage'
import { BriefingPage } from '@/pages/BriefingPage'
import { RoundPage } from '@/pages/RoundPage/RoundPage'
import { ResolvePage } from '@/pages/ResolvePage'
import { BoardPage } from '@/pages/BoardPage'
import { ResultPage } from '@/pages/ResultPage'
import { RulesPage } from '@/pages/RulesPage'
import { GuidePage } from '@/pages/GuidePage'

export default function App() {
  // 刷新后从本地存档恢复对局，避免回合页/结算页变成空白
  useEffect(() => {
    if (!useGameStore.getState().game) useGameStore.getState().resume()
  }, [])

  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<SetupPage />} />
          <Route path="/briefing" element={<BriefingPage />} />
          <Route path="/round" element={<RoundPage />} />
          <Route path="/resolve" element={<ResolvePage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/result" element={<ResultPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/guide" element={<GuidePage />} />
        </Routes>
      </Shell>
    </HashRouter>
  )
}

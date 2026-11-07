import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { screenOf, useRoomStore, wireRoomStore } from '@/store/roomStore'
import { HomePage } from '@/pages/HomePage'
import { LobbyPage } from '@/pages/LobbyPage'
import { BriefingPage } from '@/pages/BriefingPage'
import { RoundPage } from '@/pages/RoundPage/RoundPage'
import { ResolvePage } from '@/pages/ResolvePage'
import { BoardPage } from '@/pages/BoardPage'
import { ResultPage } from '@/pages/ResultPage'
import { RulesPage } from '@/pages/RulesPage'
import { GuidePage } from '@/pages/GuidePage'

/**
 * 不受状态机接管的页面：这些是「随时想看就看的资料页」，
 * 玩家主动点进去时不能被 PhaseSync 立刻弹回大厅/回合页。
 *
 * 曾经的 bug：在首页点「新手引导」，PhaseSync 发现 room 是 null（screen='home'），
 * 立刻 navigate('/')，于是这次点击看起来完全没反应。凡是这种自由浏览页
 * 都必须在这里登记，否则同样的问题会复现。
 */
const FREE_ROUTES = ['/guide', '/rules', '/board']

/**
 * 路由跟随状态机：服务端推进阶段后，所有客户端自动跳到对应页面。
 * 页面内部不再各自写「阶段不对就跳走」的守卫，避免多人多页面互相打架。
 */
function PhaseSync() {
  const room = useRoomStore((s) => s.room)
  const navigate = useNavigate()
  const location = useLocation()
  const screen = screenOf(room)

  useEffect(() => {
    // 玩家正在看资料页：交给他自己，状态机先不动
    if (FREE_ROUTES.includes(location.pathname)) return

    const target =
      screen === 'home'
        ? '/'
        : screen === 'lobby'
          ? '/lobby'
          : screen === 'briefing'
            ? '/briefing'
            : screen === 'round'
              ? '/round'
              : screen === 'resolve'
                ? '/resolve'
                : '/result'

    // 已经在目标页就不要再 navigate，避免 replace 触发无意义的重渲染
    if (location.pathname !== target) navigate(target, { replace: true })
  }, [screen, navigate, location.pathname])

  return null
}

export default function App() {
  // 联机：建立 WebSocket、接管快照。挂载一次即可，内部幂等。
  useEffect(() => {
    const teardown = wireRoomStore()
    return teardown
  }, [])

  // 刷新后自动回到原来的房间与座位（有本地 token 才会生效）；
  // 带 ?local=1 则直接进本地热座调试模式，不连任何网络。
  useEffect(() => {
    const store = useRoomStore.getState()
    const local = new URLSearchParams(window.location.search).get('local')
    if (local !== null) {
      store.startLocal()
      return
    }
    if (!store.room) store.resumeSession()
  }, [])

  return (
    <HashRouter>
      <PhaseSync />
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lobby" element={<LobbyPage />} />
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

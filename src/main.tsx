import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useGameStore } from '@/store/gameStore'

// 在首次渲染之前同步恢复存档。
// 必须赶在挂载前完成：子页面（简报／回合／结算／总览）都有「无对局则跳回首页」的守卫，
// 这些守卫在 effect 阶段执行，早于 App 内 effect 中的 resume()。
// 若只在 App 的 effect 里恢复，刷新后任何子页面都会被守卫先踢回首页。
if (!useGameStore.getState().game) useGameStore.getState().resume()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

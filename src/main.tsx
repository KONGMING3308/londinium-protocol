import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { versionInfo } from './version'

// 把版本信息挂到 window，浏览器控制台或任何自动化脚本都能直接读到
//   > __LONDINIUM__.version
window.__LONDINIUM__ = versionInfo()

// 联机版的对局状态在服务端，本地只在 roomStore 里缓存快照。
// 刷新后的恢复由 App 的 effect 触发（带 token 自动回房），这里不需要预恢复。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

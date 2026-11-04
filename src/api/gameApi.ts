/** 本地存档：读写 localStorage */
import type { GameState } from '@/types'

const KEY = 'londinium-protocol-save-v2'

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // 忽略配额错误，原型阶段不阻断对局
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (!parsed.players || parsed.players.length !== 4) return null
    return parsed
  } catch {
    return null
  }
}

export function clearGame(): void {
  localStorage.removeItem(KEY)
}

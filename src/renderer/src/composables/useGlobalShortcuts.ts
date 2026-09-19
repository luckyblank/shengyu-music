import { onBeforeUnmount, onMounted } from 'vue'
import { toggleLike } from '../stores/library'
import * as player from '../stores/player'
import * as ui from '../stores/ui'

/**
 * 全局快捷键。
 *
 * 键位表与处理器**写在同一个文件里**：此前键位表是设置页里硬编码的一份、
 * 处理器是 App.vue 里的另一份，加绑定必须记得改两处，很容易漏。
 * 现在 SHORTCUTS 就是唯一的展示来源，改这里设置页自动跟着变。
 */

export interface ShortcutEntry {
  keys: string
  action: string
}

export const SHORTCUTS: ShortcutEntry[] = [
  { keys: '空格', action: '播放 / 暂停' },
  { keys: '← / →', action: '上一首 / 下一首' },
  { keys: '↑ / ↓', action: '音量增减' },
  { keys: 'M', action: '静音开关' },
  { keys: 'L', action: '收藏当前歌曲' },
  { keys: 'Q', action: '播放队列' },
  { keys: 'N', action: '打开播放页' },
  { keys: 'E', action: '均衡器' },
  { keys: 'Esc', action: '关闭所有浮层' },
  { keys: 'Ctrl K', action: '聚焦搜索' },
  { keys: 'F11', action: '最大化 / 还原窗口' }
]

function handleKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement
  const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
  // 注意：这个守卫不覆盖 contenteditable 与 <select>，扩展前先确认没有输入场景被吞
  if (event.key === ' ' && !typing) {
    // 空格在修饰键判断之前处理，所以 Ctrl+Space 也会切换播放 —— 既有行为，保持
    event.preventDefault()
    void player.toggle()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    // 只聚焦并展开浮层，不再跳转到搜索页：搜索现在是浮层，
    // 跳页面会让结果页和浮层同时生效，Esc 关掉浮层后还留在搜索页上
    ui.openSearch()
    document.querySelector<HTMLInputElement>('.search-field input')?.focus()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return

  switch (event.key) {
    case 'ArrowRight':
      if (!typing) void player.next()
      break
    case 'ArrowLeft':
      if (!typing) void player.previous()
      break
    case 'ArrowUp':
      if (!typing) {
        event.preventDefault()
        player.setVolume(Math.min(1, player.volume.value + 0.05))
      }
      break
    case 'ArrowDown':
      if (!typing) {
        event.preventDefault()
        player.setVolume(Math.max(0, player.volume.value - 0.05))
      }
      break
    case 'm':
    case 'M':
      if (!typing) player.toggleMuted()
      break
    case 'l':
    case 'L':
      if (!typing && player.currentId.value) toggleLike(player.currentId.value)
      break
    case 'q':
    case 'Q':
      if (!typing) ui.togglePanel('queue')
      break
    case 'n':
    case 'N':
      if (!typing) ui.togglePanel('nowPlaying')
      break
    case 'e':
    case 'E':
      if (!typing) ui.togglePanel('equalizer')
      break
    case 'Escape':
      ui.closeAllPanels()
      break
    case 'F11':
      event.preventDefault()
      void window.shengyu.toggleMaximize()
      break
  }
}

export function useGlobalShortcuts(): void {
  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
}

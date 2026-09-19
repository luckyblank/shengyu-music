import './assets/main.css'

import { createApp } from 'vue'

// 开发态把未捕获错误连同堆栈打进控制台，主进程会转发到终端，便于排查。
if (import.meta.env.DEV) {
  window.addEventListener('error', (event) => {
    console.error('[renderer-error]', event.error?.stack ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[renderer-rejection]', event.reason?.stack ?? String(event.reason))
  })
}

const query = new URLSearchParams(window.location.search)
const isMini = query.has('mini')
const isDesktopLyrics = query.has('desktop-lyrics')

if (isMini) {
  import('./components/MiniPlayer.vue').then(({ default: MiniPlayer }) => {
    createApp(MiniPlayer).mount('#app')
  })
} else if (isDesktopLyrics) {
  import('./components/DesktopLyrics.vue').then(({ default: DesktopLyrics }) => {
    createApp(DesktopLyrics).mount('#app')
  })
} else {
  import('./App.vue').then(({ default: App }) => {
    createApp(App).mount('#app')
  })
}

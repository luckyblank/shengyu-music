import { ref, watch } from 'vue'
import type { AppPage } from '../types/music'
import { engine, EQ_PRESETS, FX_PRESET_LABELS, type FxPreset } from '../services/audio-engine'
import * as player from './player'

/**
 * UI store：页面导航、面板开关、Toast、均衡器、睡眠定时器。
 * 同时挂在 window.ui / window.player 上，供非组件代码（库 store 回调）轻量访问。
 */

export const activePage = ref<AppPage>('discover')
export const history = ref<AppPage[]>(['discover'])
export const searchQuery = ref('')
/**
 * 搜索浮层是否展开。
 *
 * 必须放在 store 而不是顶栏组件里：全局快捷键（Esc 关闭所有浮层、Ctrl+K 聚焦搜索）
 * 与页面跳转都要能读写它，组件局部 ref 没有第二条通道。
 */
export const searchOpen = ref(false)
export const queueOpen = ref(false)
export const nowPlayingOpen = ref(false)
export const equalizerOpen = ref(false)
export const lyricsOpen = ref(false)
/** 歌词面板锚定的曲目；null 表示跟随正在播放的曲目 */
export const lyricsTrackId = ref<string | null>(null)
export const mvOpen = ref(false)
/** 歌手聚合页当前艺人 */
export const artistPage = ref<string | null>(null)
/**
 * 当前打开的歌单。
 * 必须放在 store 而非 App.vue 的局部 ref —— 侧栏选中态依赖它，
 * 拆出 AppSidebar 后没有别的通道。
 */
export const currentPlaylistId = ref<string | null>(null)

/** 打开歌单详情页。 */
export function openPlaylist(id: string): void {
  currentPlaylistId.value = id
  navigate('playlist')
}
/** 搜索历史（持久化，最近 10 条） */
export const searchHistory = ref<string[]>([])
/** 已关注的主播（SomaFM dj 原值，持久化） */
export const followedHosts = ref<string[]>([])
export const sleepEndsAt = ref(0)

/* --------------------------------- 主题 --------------------------------- */

export const theme = ref<'dark' | 'light'>('dark')

/** 各主题对应的窗口底色（同步给主进程，避免 resize 时闪色） */
const THEME_BG: Record<'dark' | 'light', string> = {
  dark: '#0d2024',
  light: '#edf2f7'
}

export function applyTheme(): void {
  document.documentElement.setAttribute('data-theme', theme.value)
  void window.shengyu.setThemeBackground(THEME_BG[theme.value])
}

export function setTheme(value: 'dark' | 'light'): void {
  theme.value = value
  applyTheme()
  persistTheme()
}

export function toggleTheme(): void {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}

function persistTheme(): void {
  window.shengyu.saveState({ settings: { theme: theme.value } } as never)
}

/* ------------------------------ 歌词颜色 ------------------------------ */

export const lyricsColor = ref('#ffffff')

export const LYRICS_COLOR_PRESETS = [
  '#ffffff',
  '#a3b56e',
  '#ffd54f',
  '#ff9eb5',
  '#ff8a2b',
  '#7fd8e8',
  '#c5a7ff',
  '#ff6b6b'
]

export function setLyricsColor(color: string): void {
  lyricsColor.value = color
  document.documentElement.style.setProperty('--lyrics-color', color)
  window.shengyu.reportLyricsColor(color)
  window.shengyu.saveState({ settings: { lyricsColor: color } } as never)
}

/* ------------------------------ 搜索历史 ------------------------------ */

export function pushSearchHistory(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) return
  searchHistory.value = [trimmed, ...searchHistory.value.filter((item) => item !== trimmed)].slice(
    0,
    10
  )
  window.shengyu.saveState({ settings: { searchHistory: [...searchHistory.value] } } as never)
}

export function clearSearchHistory(): void {
  searchHistory.value = []
  window.shengyu.saveState({ settings: { searchHistory: [] } } as never)
}

/** 删除单条搜索历史。 */
export function removeSearchHistory(query: string): void {
  searchHistory.value = searchHistory.value.filter((item) => item !== query)
  window.shengyu.saveState({ settings: { searchHistory: [...searchHistory.value] } } as never)
}

/**
 * 关注/取关电台主播。
 * 展开成普通数组再交给 saveState —— 响应式代理跨 contextBridge 无法克隆。
 */
export function toggleFollowHost(name: string): void {
  const host = name.trim()
  if (!host) return
  const next = followedHosts.value.includes(host)
    ? followedHosts.value.filter((item) => item !== host)
    : [...followedHosts.value, host]
  followedHosts.value = next
  window.shengyu.saveState({ settings: { followedHosts: [...next] } } as never)
  toast(followedHosts.value.includes(host) ? `已关注 ${host}` : `已取消关注 ${host}`, 'success')
}

/**
 * 打开搜索浮层。
 * 先收起其他浮层：右侧抽屉与搜索浮层叠在一起会互相遮住半边。
 */
export function openSearch(): void {
  closeAllPanels()
  searchOpen.value = true
}

export function closeSearch(): void {
  searchOpen.value = false
}

/** 打开歌词面板跟随当前播放。 */
export function openCurrentLyrics(): void {
  lyricsTrackId.value = null
  togglePanel('lyrics')
}

/** 浏览指定曲目的歌词（不改变播放）。 */
export function openLyricsFor(trackId: string): void {
  lyricsTrackId.value = trackId
  openPanel('lyrics')
}

/* ---------------------------- 面板互斥管理 ---------------------------- */

export type PanelName = 'queue' | 'lyrics' | 'equalizer' | 'nowPlaying' | 'mv'

const panelRefs: Record<PanelName, ReturnType<typeof ref<boolean>>> = {
  queue: queueOpen,
  lyrics: lyricsOpen,
  equalizer: equalizerOpen,
  nowPlaying: nowPlayingOpen,
  mv: mvOpen
}

/** 打开生成式 MV（可视化音乐视频，全屏）。 */
export function openMv(): void {
  openPanel('mv')
}

/** 打开一个面板并关闭其余面板（右侧面板会互相遮挡，必须互斥）。 */
export function openPanel(name: PanelName): void {
  // 搜索浮层也算同类浮层，而且它的遮罩停在播放条上方 —— 不一起收起来的话，
  // 用户能在搜索展开时点开播放队列，两层同时「开着」，状态就乱了。
  searchOpen.value = false
  for (const [key, refItem] of Object.entries(panelRefs)) {
    refItem.value = key === name
  }
}

export function closePanel(name: PanelName): void {
  panelRefs[name].value = false
}

export function closeAllPanels(): void {
  for (const refItem of Object.values(panelRefs)) refItem.value = false
  // 搜索浮层同样属于「浮层」：Esc 与启动收敛都要把它一并收起
  searchOpen.value = false
}

export function togglePanel(name: PanelName): void {
  if (panelRefs[name].value) closePanel(name)
  else openPanel(name)
}

export const pageTitle = (page: AppPage): string =>
  ({
    discover: '发现音乐',
    search: '搜索',
    radio: '网络电台',
    charts: '排行榜',
    library: '我的音乐库',
    favorites: '我喜欢的音乐',
    recent: '最近播放',
    daily: '每日推荐',
    artist: '歌手',
    report: '听歌报告',
    settings: '设置',
    playlist: '歌单'
  })[page]

export function navigate(page: AppPage): void {
  if (activePage.value !== page) {
    history.value.push(page)
    activePage.value = page
  }
  if (page !== 'search') searchQuery.value = ''
  if (history.value.length > 40) history.value = history.value.slice(-40)
}

export function goBack(): void {
  if (history.value.length <= 1) return
  history.value.pop()
  activePage.value = history.value[history.value.length - 1]
}

/* --------------------------------- Toast --------------------------------- */

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export const toasts = ref<Toast[]>([])
let toastSeq = 0

export function toast(message: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastSeq
  toasts.value.push({ id, kind, message })
  if (toasts.value.length > 4) toasts.value.shift()
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }, 3800)
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((item) => item.id !== id)
}

/* -------------------------------- 均衡器 -------------------------------- */

export const eqEnabled = ref(false)
export const eqPreset = ref('flat')
export const eqGains = ref([...EQ_PRESETS.flat])

/** 预设中文名。'custom' 不是可点的预设，而是手动拖过任一频段后的状态 */
export const EQ_PRESET_LABELS: Record<string, string> = {
  flat: '平直',
  pop: '流行',
  rock: '摇滚',
  vocal: '人声',
  night: '夜间',
  custom: '自定义'
}

function applyEq(): void {
  engine.setEqualizer(eqEnabled.value, eqGains.value)
}

export function setEqPreset(name: string): void {
  const preset = EQ_PRESETS[name]
  if (!preset) return
  eqPreset.value = name
  eqGains.value = [...preset]
  applyEq()
}

export function setEqGain(band: number, value: number): void {
  eqGains.value[band] = value
  eqPreset.value = 'custom'
  applyEq()
}

export function toggleEq(): void {
  eqEnabled.value = !eqEnabled.value
  applyEq()
}

/* -------------------------------- 音效 -------------------------------- */

export const fxPreset = ref<FxPreset>('none')
export const FX_LABELS = FX_PRESET_LABELS

export function setFxPreset(preset: FxPreset): void {
  fxPreset.value = preset
  engine.setFx(preset)
  persistFx()
}

function persistFx(): void {
  window.shengyu.saveState({ settings: { fx: fxPreset.value } } as never)
}

watch(eqEnabled, applyEq)

export function persistEq(): void {
  window.shengyu.saveState({
    equalizer: { enabled: eqEnabled.value, preset: eqPreset.value, gains: [...eqGains.value] }
  })
}

export async function hydrateUi(state: {
  equalizer: { enabled: boolean; preset: string; gains: number[] }
  theme: string
  fx: string
  lyricsColor: string
  searchHistory: string[]
  followedHosts: string[]
}): Promise<void> {
  // 启动即收敛：所有浮层面板一律关闭，只有用户点击才打开
  closeAllPanels()
  // 每次启动都落在发现音乐，不恢复上次停留的页面；history 一并复位，
  // 否则「返回」会退到上一次会话访问过的页面（activePage 是模块级 ref，热更新时不重置）
  activePage.value = 'discover'
  history.value = ['discover']
  searchHistory.value = Array.isArray(state.searchHistory) ? state.searchHistory.slice(0, 10) : []
  followedHosts.value = Array.isArray(state.followedHosts) ? state.followedHosts.slice(0, 20) : []
  eqEnabled.value = state.equalizer.enabled
  eqPreset.value = state.equalizer.preset
  if (state.equalizer.gains?.length === 5) eqGains.value = [...state.equalizer.gains]
  applyEq()
  const fx = state.fx as FxPreset
  if (fx && fx in FX_PRESET_LABELS) {
    fxPreset.value = fx
    engine.setFx(fx)
  }
  if (state.theme === 'light' || state.theme === 'dark') theme.value = state.theme
  applyTheme()
  if (/^#[0-9a-fA-F]{6}$/.test(state.lyricsColor ?? '')) {
    lyricsColor.value = state.lyricsColor
    document.documentElement.style.setProperty('--lyrics-color', state.lyricsColor)
    window.shengyu.reportLyricsColor(state.lyricsColor)
  }
}

/* -------------------------------- 睡眠定时器 -------------------------------- */

let sleepTimer: number | undefined

export function setSleepTimer(minutes: number): void {
  if (sleepTimer) window.clearTimeout(sleepTimer)
  if (minutes <= 0) {
    sleepEndsAt.value = 0
    toast('睡眠定时器已关闭', 'info')
    return
  }
  sleepEndsAt.value = Date.now() + minutes * 60 * 1000
  toast(`将在 ${minutes} 分钟后停止播放`, 'info')
  sleepTimer = window.setTimeout(
    async () => {
      sleepEndsAt.value = 0
      if (player.isPlaying.value) {
        await player.toggle()
        toast('睡眠时间到，已暂停播放', 'info')
      }
    },
    minutes * 60 * 1000
  )
}

/* ------------------------------ 暴露给库层回调 ------------------------------ */

declare global {
  interface Window {
    ui?: { toast: typeof toast; ask: (title: string, message: string) => Promise<boolean> }
    player?: { toggleLike: () => void }
  }
}

window.ui = {
  toast,
  ask: (title, message) =>
    new Promise((resolve) => {
      window.dispatchEvent(new CustomEvent('sy-ask', { detail: { title, message, resolve } }))
    })
}
window.player = { toggleLike: () => void 0 }

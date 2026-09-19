/**
 * 主进程与渲染进程共用的 IPC 契约。
 * 只放类型与常量，不放实现，避免任何一侧引入另一侧的运行时依赖。
 */

export const IPC = {
  stateLoad: 'state:load',
  stateSave: 'state:save',
  statePath: 'state:path',
  libraryPickFiles: 'library:pick-files',
  libraryPickFolder: 'library:pick-folder',
  libraryResolvePaths: 'library:resolve-paths',
  libraryReadLyrics: 'library:read-lyrics',
  libraryPickLyrics: 'library:pick-lyrics',
  libraryReveal: 'library:reveal',
  libraryCheck: 'library:check',
  chartsFetch: 'charts:fetch',
  radioChannels: 'radio:channels',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  playerReportState: 'player:report-state',
  playerRemoteCommand: 'player:remote-command',
  playerCommand: 'player:command',
  playerSync: 'player:sync',
  playerProgress: 'player:progress',
  windowEnterMini: 'window:enter-mini',
  windowExitMini: 'window:exit-mini',
  windowMiniClosed: 'window:mini-closed',
  windowEnterDesktopLyrics: 'window:enter-desktop-lyrics',
  windowExitDesktopLyrics: 'window:exit-desktop-lyrics',
  lyricsLine: 'lyrics:line',
  lyricsColor: 'lyrics:color',
  lyricsGetColor: 'lyrics:get-color',
  windowThemeBackground: 'window:theme-background',
  appVersions: 'app:versions'
} as const

/** 主进程向所有窗口（主窗 + 迷你窗）广播的播放状态。 */
export interface PlayerSyncPayload {
  title: string
  artist: string
  album: string
  /** 生成封面变体名或协议 URL */
  cover: string | null
  origin: string
  isPlaying: boolean
  position: number
  duration: number
}

/** 托盘、媒体键、缩略图工具栏统一下发的远程指令。 */
export type RemoteCommand =
  | 'play-pause'
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'stop'
  | 'like'
  | 'volume-up'
  | 'volume-down'

/** 主进程扫描出的一条本地音轨元数据。 */
export interface LocalTrackMeta {
  /** 由绝对路径派生的稳定 ID：local-<hash> */
  id: string
  path: string
  /** 可直接喂给 <audio> / <img> 的自定义协议地址 */
  url: string
  title: string
  artist: string
  album: string
  /** 标签或容器头能算出的时长（秒）；0 表示需要渲染层探测 */
  duration: number
  format: string
  size: number
  modifiedAt: number
  /** 内嵌封面缓存后的协议地址 */
  coverUrl?: string
  /** 同目录同名 .lrc 侧车文件 */
  lyricsPath?: string
  trackNo?: number
  year?: string
  sampleRate?: number
  bitrate?: number
}

/**
 * 在线榜单流派标签。genre 直接进 Audius 接口的查询串，主进程按这份白名单校验，
 * 避免渲染层塞任意值进来。实测无数据的标签（City Pop / K-Pop / J-Pop）未收录。
 */
export const CHART_GENRES = [
  { key: 'all', label: '全部', genre: '' },
  { key: 'pop', label: '流行', genre: 'Pop' },
  { key: 'electronic', label: '电子', genre: 'Electronic' },
  { key: 'hiphop', label: '嘻哈', genre: 'Hip-Hop/Rap' },
  { key: 'rock', label: '摇滚', genre: 'Rock' },
  { key: 'rnb', label: 'R&B', genre: 'R&B/Soul' },
  { key: 'ambient', label: '氛围', genre: 'Ambient' },
  { key: 'house', label: '浩室', genre: 'House' },
  { key: 'jazz', label: '爵士', genre: 'Jazz' },
  { key: 'indie', label: '独立', genre: 'Indie' }
] as const

/** 榜单统计周期，对应 Audius 的 time 参数。 */
export const CHART_PERIODS = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'allTime', label: '总榜' }
] as const

/** 一条在线曲目。音频与封面都经 shengyu-media:// 代理，渲染层不接触第三方域名。 */
export interface OnlineTrackMeta {
  /** audius-<trackId> */
  id: string
  title: string
  artist: string
  album: string
  /** 完整曲目时长（秒） */
  duration: number
  /** shengyu-media:// 代理地址，可拖动进度 */
  url: string
  /** shengyu-media:// 代理封面地址 */
  coverUrl: string
  genre: string
  /** 榜单名次，从 1 开始 */
  rank: number
  /** 平台真实播放量（非本地统计，直接来自 Audius） */
  playCount: number
  /** 平台真实收藏人数 */
  favoriteCount: number
  /** 平台真实转发数 */
  repostCount: number
}

export interface ChartResult {
  /** 缓存键：流派 + 周期 */
  key: string
  genreLabel: string
  periodLabel: string
  updatedAt: number
  /** 因超过时长上限被过滤掉的曲目数 */
  skipped: number
  tracks: OnlineTrackMeta[]
}

/** 一个公播电台频道（SomaFM）。listeners 是接口给的实时在线人数。 */
export interface RadioChannel {
  /** soma-<channelId> */
  id: string
  title: string
  description: string
  /** 归组后的中文分类，由接口的管道分隔 genre 取主类型而来 */
  genre: string
  /**
   * 接口给的原始分类串，按 `|` 拆好并转成中文（如 ['氛围', '环境']）。
   * 卡片上的标签要用它 —— 只给主分类会让「氛围 · 环境 · 实验」这类真实标签丢失。
   */
  genres: string[]
  /**
   * 该频道的主播名。接口大部分频道给的是真人（如 Rusty Hodge），
   * 少数给的是机构名或空串 —— 聚合「热门主播」时按真实值来，拿不到就跳过。
   */
  dj: string
  /** 实时在线收听人数（接口给的是字符串，已转数字） */
  listeners: number
  coverUrl: string
  /** icecast 直连流地址 */
  url: string
  /** 该频道当前在播的曲目，可能为空 */
  lastPlaying: string
}

export interface RadioGenreGroup {
  name: string
  channels: RadioChannel[]
}

export interface RadioChannelsResult {
  updatedAt: number
  /** 全部频道当前在线人数合计 */
  totalListeners: number
  groups: RadioGenreGroup[]
  channels: RadioChannel[]
}

/** 榜单名次快照，用于算出真实的升降趋势。 */
export interface ChartSnapshot {
  /** YYYY-MM-DD；同一天内不重复记录 */
  date: string
  /** trackId → 名次 */
  ranks: Record<string, number>
}

/**
 * 听歌画像的原始计数。
 * 有了它，「你常在深夜听歌」「偏好氛围与电子」才是真实推导而非编造。
 */
export interface PlayStats {
  /** 24 个时段桶，下标为小时 */
  hours: number[]
  /** 流派 → 播放次数 */
  genres: Record<string, number>
  /** 音乐人 → 播放次数 */
  artists: Record<string, number>
}

export interface ImportResult {
  tracks: LocalTrackMeta[]
  /** 用户取消对话框 */
  canceled: boolean
  /** 扫描到但无法解析的文件数 */
  skipped: number
  /** 本次导入涉及的根目录，主进程用它维护读取白名单 */
  roots: string[]
}

export interface AppVersions {
  app: string
  electron: string
  chrome: string
  node: string
  v8: string
  platform: string
}

export type RepeatMode = 'off' | 'all' | 'one'

export interface PersistedPlayback {
  trackId: string | null
  position: number
  volume: number
  muted: boolean
  shuffled: boolean
  repeat: RepeatMode
  queue: string[]
  queueLabel: string
}

export interface PersistedPlaylist {
  id: string
  title: string
  description: string
  trackIds: string[]
  cover: string
  eyebrow: string
  /** 用户自建歌单可改名/删除 */
  custom: boolean
  createdAt: number
}

export interface PersistedRecentPlay {
  id: string
  at: number
  count: number
}

export interface PersistedEqualizer {
  enabled: boolean
  preset: string
  /** 5 段增益，dB，顺序与 EQ_BANDS 对应 */
  gains: number[]
}

export interface AppState {
  version: number
  playback: PersistedPlayback
  imported: LocalTrackMeta[]
  /**
   * 用户从在线榜单导入曲库的曲目。
   * 必须与 imported 分开存：imported 的 path 会被启动流程当作真实磁盘路径
   * 建协议白名单、并参与本地文件校验，混入在线曲会误删。
   */
  onlineTracks: OnlineTrackMeta[]
  liked: string[]
  recent: PersistedRecentPlay[]
  playlists: PersistedPlaylist[]
  equalizer: PersistedEqualizer
  /** 用户为任意曲目（演示/在线等）手动导入的歌词文本，key 为曲目 ID */
  lyricsTexts: Record<string, string>
  /** 各榜单上一次加载时的名次，按榜单缓存键索引 */
  chartSnapshots: Record<string, ChartSnapshot>
  /** 听歌画像的原始计数 */
  playStats: PlayStats
  settings: {
    crossfade: boolean
    restoreOnLaunch: boolean
    trayEnabled: boolean
    theme: string
    fx: string
    lyricsColor: string
    searchHistory: string[]
    /** 已关注的主播名（SomaFM 的 dj 字段原值），电台页「热门主播」用 */
    followedHosts: string[]
  }
}

export interface LyricsPickResult {
  canceled: boolean
  path: string | null
  text: string | null
}

export const AUDIO_EXTENSIONS = [
  '.mp3',
  '.flac',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.wma',
  '.mp4',
  '.webm'
] as const

export const MEDIA_SCHEME = 'shengyu-media'

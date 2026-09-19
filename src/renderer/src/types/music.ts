import type { RepeatMode } from '@shared/ipc'

export type AppPage =
  | 'discover'
  | 'search'
  | 'radio'
  | 'charts'
  | 'library'
  | 'favorites'
  | 'recent'
  | 'daily'
  | 'artist'
  | 'report'
  | 'settings'
  | 'playlist'

export type CoverVariant = 'ember' | 'tide' | 'moss' | 'violet' | 'sand' | 'night'

/** 封面来源：内置生成封面变体，或本地内嵌封面协议地址。 */
export type CoverSpec = { kind: 'variant'; variant: CoverVariant } | { kind: 'url'; url: string }

export type TrackOrigin = 'demo' | 'local' | 'remote' | 'radio'

/** 演示曲的程序化合成配方（生成式音源）。 */
export interface SynthRecipe {
  bpm: number
  root: number
  mode: 'pentatonic' | 'dorian' | 'lydian'
  /** 每 4 小节一组和弦进行，值是相对 root 的半音 */
  progression: number[][]
  /** 织体：全铺 / 拨弦 / 钟琴，决定主要音色 */
  texture: 'pad' | 'pluck' | 'bell'
  /** 打击乐密度 0..1 */
  drums: number
  brightness: number
  reverb: number
}

export interface Track {
  /** demo 曲：数字 id；本地文件：local-<hash> */
  id: string
  title: string
  artist: string
  album: string
  /** 秒；本地文件在导入后由时长探测回写 */
  duration: number
  cover: CoverSpec
  origin: TrackOrigin
  liked?: boolean
  format?: string
  /** 本地文件磁盘路径（仅本地曲目） */
  path?: string
  /** 音源地址（本地走 shengyu-media:// 协议；在线为 https 直链） */
  url?: string
  /** 在线音源：目标域名支持 CORS 时为 true，否则不走 Web Audio 通路 */
  cors?: boolean
  lyricsPath?: string
  addedAt?: number
  /** 演示曲合成配方 */
  synth?: SynthRecipe
  /** 榜单名次（仅在线榜单曲目） */
  rank?: number
  /** 风格标签（仅在线榜单曲目） */
  genre?: string
  /** 平台真实播放量（仅在线榜单曲目，来自 Audius，非本地统计） */
  playCount?: number
  /** 平台真实收藏人数 */
  favoriteCount?: number
  /** 平台真实转发数 */
  repostCount?: number
}

export interface Playlist {
  id: string
  title: string
  description: string
  trackIds: string[]
  cover: CoverSpec
  eyebrow: string
  custom: boolean
  createdAt: number
}

/** 一条歌词行 */
export interface LyricLine {
  /** 毫秒 */
  time: number
  text: string
  /** 逐字时间轴（卡拉OK），每个词相对该行的毫秒偏移 */
  words?: { offset: number; text: string }[]
}

export interface ParsedLyrics {
  lines: LyricLine[]
  /** 是否为内嵌的演示歌词（人工编写的短诗） */
  demo: boolean
  /** 原始元数据（ar/ti/al） */
  meta: Record<string, string>
}

/** 队列来源标签，用于「接下来播放」标题 */
export type QueueLabel =
  | 'demo'
  | 'playlist'
  | 'library'
  | 'album'
  | 'search'
  | 'single'
  | 'radio'
  | 'charts'

export type RepeatModeLocal = RepeatMode

export interface EngineStateSnapshot {
  currentId: string | null
  position: number
  duration: number
  volume: number
  muted: boolean
  isPlaying: boolean
  loading: boolean
  failed: boolean
  /** 当前来源是否在产生真实音频信号（本地文件 CORS 降级后为 false，走伪频谱） */
  liveSignal: boolean
}

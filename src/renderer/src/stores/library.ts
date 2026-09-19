import { computed, ref } from 'vue'
import type {
  ChartSnapshot,
  LocalTrackMeta,
  OnlineTrackMeta,
  PersistedPlaylist,
  PlayStats
} from '@shared/ipc'
import { demoTracks, remoteTracks, defaultPlaylists, photoCover } from '../data/catalog'
import type { CoverVariant, CoverSpec, Playlist, Track } from '../types/music'

/**
 * 曲库 store：演示曲 + 本地导入曲 + 在线榜单曲 + 歌单 + 收藏 + 最近播放。
 * 持久化走主进程 state.json（导入元数据本身也一并保存，启动秒开）。
 */

const toTrack = (meta: LocalTrackMeta): Track => ({
  id: meta.id,
  title: meta.title,
  artist: meta.artist,
  album: meta.album,
  duration: meta.duration,
  cover: meta.coverUrl ? { kind: 'url', url: meta.coverUrl } : photoCover(coverVariantFor(meta.id)),
  origin: 'local',
  format: meta.format,
  path: meta.path,
  url: meta.url,
  lyricsPath: meta.lyricsPath,
  addedAt: Date.now()
})

const coverVariantFor = (seed: string): CoverVariant => {
  const variants = ['ember', 'tide', 'moss', 'violet', 'sand', 'night'] as const
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return variants[hash % variants.length]
}

/**
 * 在线榜单曲目 → 播放器曲目。
 * cors 为 true：音频由主进程代理并带回 ACAO *，可进 Web Audio 图出真实频谱。
 */
export const onlineMetaToTrack = (meta: OnlineTrackMeta): Track => ({
  id: meta.id,
  title: meta.title,
  artist: meta.artist,
  album: meta.album,
  duration: meta.duration,
  cover: meta.coverUrl ? { kind: 'url', url: meta.coverUrl } : photoCover(coverVariantFor(meta.id)),
  origin: 'remote',
  url: meta.url,
  cors: true,
  rank: meta.rank,
  genre: meta.genre,
  playCount: meta.playCount,
  favoriteCount: meta.favoriteCount,
  repostCount: meta.repostCount,
  addedAt: Date.now()
})

export const importedTracks = ref<Track[]>([])
/** 从在线榜单导入曲库的曲目（与本地导入分开存，见 AppState.onlineTracks 的注释） */
export const onlineTracks = ref<Track[]>([])
/** 导入扫描进行中（文件/文件夹/拖放共用） */
export const importing = ref(false)
/**
 * 临时并入曲库的曲目（当前在线榜单）。
 *
 * 不放进 allTracks 的话，榜单里未导入的曲目虽然能出声，但 trackById 解析不到：
 * 播放条会空白、行内收藏与右键菜单「加入歌单」会写入解析不到的 id。
 * 由 online store 写入，随榜单切换而替换，不落盘。
 */
export const transientTracks = ref<Track[]>([])

/**
 * 全库曲目：本地导入 + 在线收藏 + 榜单临时曲 + 演示曲 + 内置在线。
 *
 * **必须按 id 去重，且先到先得。** 同一首在线曲目可能同时存在于「在线收藏」
 * （播放过、已落盘）与 transientTracks（当前榜单）里，直接拼接就会让它在列表里
 * 出现两行、在「播放全部」队列里排两次 —— 表现正是「点一下播放，曲库多出一首重复的歌」。
 * 顺序即优先级：已落盘的那份更稳，addedAt 是导入时间而不是每次拉榜单的时间，
 * 「最近添加」排序不会因为刷新榜单而乱跳。
 */
export const allTracks = computed<Track[]>(() => {
  const merged: Track[] = []
  const seen = new Set<string>()
  for (const track of [
    ...importedTracks.value,
    ...onlineTracks.value,
    ...transientTracks.value,
    ...demoTracks,
    ...remoteTracks
  ]) {
    if (seen.has(track.id)) continue
    seen.add(track.id)
    merged.push(track)
  }
  return merged
})
export const likedIds = ref(new Set<string>())
export const recent = ref<{ id: string; at: number; count: number }[]>([])
export const playlists = ref<Playlist[]>(defaultPlaylists)
/** 用户手动导入的歌词文本（任意曲目），key 为曲目 ID */
export const customLyrics = ref<Record<string, string>>({})
/** 听歌画像的原始计数（时段/流派/音乐人），由 recordPlay 累加，只做真实聚合 */
export const playStats = ref<PlayStats>({ hours: new Array(24).fill(0), genres: {}, artists: {} })
/** 各榜单上一次加载的名次，用于算真实升降 */
export const chartSnapshots = ref<Record<string, ChartSnapshot>>({})

const trackIndex = computed(() => {
  const map = new Map<string, Track>()
  for (const track of allTracks.value) map.set(track.id, track)
  return map
})

export const trackById = (id: string | null | undefined): Track | undefined =>
  id ? trackIndex.value.get(id) : undefined

/**
 * 歌单曲目。trackIds 去重是必要的：addToPlaylist 现在有 includes 守卫，但历史
 * state.json 或 createPlaylist 传入的 id 列表可能自带重复 —— 重复行会让歌单页
 * 出现两张一样的卡片。
 */
export const tracksOfPlaylist = (playlist: Playlist): Track[] => {
  const seen = new Set<string>()
  const tracks: Track[] = []
  for (const id of playlist.trackIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const track = trackById(id)
    if (track) tracks.push(track)
  }
  return tracks
}

export const playlistsOfTrack = (trackId: string): Playlist[] =>
  playlists.value.filter((playlist) => playlist.trackIds.includes(trackId))

/* -------------------------------- 导入 -------------------------------- */

export async function importViaPicker(kind: 'files' | 'folder'): Promise<number> {
  importing.value = true
  try {
    const result =
      kind === 'files' ? await window.shengyu.pickFiles() : await window.shengyu.pickFolder()
    if (result.canceled) return 0
    return mergeImported(result.tracks, result.skipped)
  } finally {
    importing.value = false
  }
}

export async function importPaths(paths: string[]): Promise<number> {
  if (!paths.length) return 0
  importing.value = true
  try {
    const result = await window.shengyu.resolvePaths(paths)
    return mergeImported(result.tracks, result.skipped)
  } finally {
    importing.value = false
  }
}

function mergeImported(metas: LocalTrackMeta[], skipped: number): number {
  const existing = new Map(importedTracks.value.map((track) => [track.id, track]))
  let added = 0
  for (const meta of metas) {
    const track = toTrack(meta)
    const old = existing.get(meta.id)
    if (old) {
      Object.assign(old, track, { addedAt: old.addedAt })
    } else {
      importedTracks.value.push(track)
      added += 1
    }
  }
  persist()
  void probeDurations(metas)
  void window.ui?.toast?.(
    added
      ? `已导入 ${added} 首歌曲${skipped ? `，跳过 ${skipped} 个不可用文件` : ''}`
      : `这些歌曲已在曲库中${skipped ? `，跳过 ${skipped} 个不可用文件` : ''}`,
    'success'
  )
  return added
}

/** 元数据拿不到时长的文件，导入后用隐藏元素探测真实时长并回写。 */
async function probeDurations(metas: LocalTrackMeta[]): Promise<void> {
  const needProbe = metas.filter((meta) => meta.duration <= 0)
  for (const meta of needProbe) {
    await new Promise<void>((resolve) => {
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.src = meta.url
      const done = (): void => {
        const duration = audio.duration
        if (Number.isFinite(duration) && duration > 0) {
          const track = trackById(meta.id)
          if (track) {
            track.duration = Math.round(duration)
            persist()
          }
        }
        audio.removeAttribute('src')
        resolve()
      }
      audio.addEventListener('loadedmetadata', done)
      audio.addEventListener('error', () => {
        audio.removeAttribute('src')
        resolve()
      })
      window.setTimeout(() => {
        audio.removeAttribute('src')
        resolve()
      }, 4000)
    })
  }
}

/* ------------------------------ 在线榜单导入 ------------------------------ */

/**
 * 把榜单曲目并入曲库。已存在的跳过（榜单每天都变，重复导入是常态）。
 * 返回新增数量，调用方据此决定提示文案。
 */
export function importOnlineTracks(metas: OnlineTrackMeta[]): number {
  const existing = new Set(onlineTracks.value.map((track) => track.id))
  let added = 0
  for (const meta of metas) {
    if (existing.has(meta.id)) continue
    onlineTracks.value.push(onlineMetaToTrack(meta))
    added += 1
  }
  persist()
  return added
}

export async function removeFromLibrary(trackId: string): Promise<void> {
  const track = trackById(trackId)
  importedTracks.value = importedTracks.value.filter((item) => item.id !== trackId)
  onlineTracks.value = onlineTracks.value.filter((item) => item.id !== trackId)
  likedIds.value = new Set([...likedIds.value].filter((id) => id !== trackId))
  for (const playlist of playlists.value) {
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId)
  }
  persist()
  if (track?.path) window.ui?.toast?.(`已从曲库移除「${track.title}」`, 'info')
}

/** 启动时校验本地文件是否还在，清理失效条目。 */
export async function validateLocalFiles(): Promise<void> {
  const locals = importedTracks.value
  if (!locals.length) return
  const result = await window.shengyu.checkPaths(locals.map((track) => track.path as string))
  const missing = locals.filter((track) => !result[track.path as string])
  if (!missing.length) return
  importedTracks.value = importedTracks.value.filter((track) => result[track.path as string])
  for (const playlist of playlists.value) {
    const gone = new Set(missing.map((track) => track.id))
    playlist.trackIds = playlist.trackIds.filter((id) => !gone.has(id))
  }
  window.ui?.toast?.(`有 ${missing.length} 个文件已失效，已从曲库移除`, 'warning')
  persist()
}

/* -------------------------------- 收藏 -------------------------------- */

export function toggleLike(trackId: string): void {
  const next = new Set(likedIds.value)
  if (next.has(trackId)) next.delete(trackId)
  else next.add(trackId)
  likedIds.value = next
  persist()
}

export const likedTracks = computed(() =>
  allTracks.value.filter((track) => likedIds.value.has(track.id))
)

/* -------------------------------- 歌单 -------------------------------- */

export function createPlaylist(title: string, trackIds: string[] = []): Playlist {
  const playlist: Playlist = {
    id: `p-${Date.now().toString(36)}`,
    title,
    description: '自建歌单',
    trackIds,
    cover: { kind: 'variant', variant: 'moss' },
    eyebrow: '我的歌单',
    custom: true,
    createdAt: Date.now()
  }
  playlists.value.push(playlist)
  persist()
  return playlist
}

export function renamePlaylist(id: string, title: string): void {
  const playlist = playlists.value.find((item) => item.id === id)
  if (playlist) {
    playlist.title = title
    persist()
  }
}

export function deletePlaylist(id: string): void {
  playlists.value = playlists.value.filter((item) => item.id !== id)
  persist()
}

export function addToPlaylist(playlistId: string, trackId: string): void {
  const playlist = playlists.value.find((item) => item.id === playlistId)
  if (!playlist) return
  if (playlist.trackIds.includes(trackId)) {
    window.ui?.toast?.('这首歌已经在这个歌单里了', 'info')
    return
  }
  playlist.trackIds.push(trackId)
  persist()
  window.ui?.toast?.(`已加入「${playlist.title}」`, 'success')
}

export function removeFromPlaylist(playlistId: string, trackId: string): void {
  const playlist = playlists.value.find((item) => item.id === playlistId)
  if (!playlist) return
  playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId)
  persist()
}

/* -------------------------------- 歌词挂载 -------------------------------- */

/** 把用户选择的 .lrc 文本挂到任意曲目；本地文件同时记录侧车路径。 */
export async function attachLyrics(trackId: string): Promise<boolean> {
  const result = await window.shengyu.pickLyrics()
  if (result.canceled || !result.text) {
    if (!result.canceled) window.ui?.toast?.('歌词文件读取失败', 'warning')
    return false
  }
  customLyrics.value = { ...customLyrics.value, [trackId]: result.text }
  const track = trackById(trackId)
  if (track?.origin === 'local' && result.path) track.lyricsPath = result.path
  persist()
  window.ui?.toast?.('歌词已挂载', 'success')
  return true
}

export function clearLyrics(trackId: string): void {
  const next = { ...customLyrics.value }
  delete next[trackId]
  customLyrics.value = next
  const track = trackById(trackId)
  if (track?.origin === 'local') track.lyricsPath = undefined
  persist()
  window.ui?.toast?.('已移除该曲目的歌词', 'info')
}

/* ------------------------------- 持久化 ------------------------------- */

let saveTimer: ReturnType<typeof setTimeout> | undefined
let hydrated = false

function persist(): void {
  if (!hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    window.shengyu.saveState({
      imported: importedTracks.value.map(serializeTrack),
      // 响应式代理无法跨 contextBridge 克隆，逐条展开成普通对象
      onlineTracks: onlineTracks.value.map(serializeOnlineTrack),
      liked: [...likedIds.value],
      // 响应式代理无法跨 contextBridge 克隆，必须展开为普通对象
      recent: recent.value.map((item) => ({ ...item })),
      playlists: playlists.value.map(serializePlaylist),
      lyricsTexts: { ...customLyrics.value },
      // 同理：响应式对象不能跨 contextBridge，逐层展开
      playStats: {
        hours: [...playStats.value.hours],
        genres: { ...playStats.value.genres },
        artists: { ...playStats.value.artists }
      },
      chartSnapshots: { ...chartSnapshots.value }
    })
  }, 300)
}

const serializeTrack = (track: Track): LocalTrackMeta => ({
  id: track.id,
  path: track.path as string,
  url: track.url as string,
  title: track.title,
  artist: track.artist,
  album: track.album,
  duration: track.duration,
  format: track.format ?? '?',
  size: 0,
  modifiedAt: 0,
  coverUrl: track.cover.kind === 'url' ? track.cover.url : undefined,
  lyricsPath: track.lyricsPath
})

const serializeOnlineTrack = (track: Track): OnlineTrackMeta => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  album: track.album,
  duration: track.duration,
  url: track.url ?? '',
  coverUrl: track.cover.kind === 'url' ? track.cover.url : '',
  genre: track.genre ?? '',
  rank: track.rank ?? 0,
  playCount: track.playCount ?? 0,
  favoriteCount: track.favoriteCount ?? 0,
  repostCount: track.repostCount ?? 0
})

const serializePlaylist = (playlist: Playlist): PersistedPlaylist => ({
  id: playlist.id,
  title: playlist.title,
  description: playlist.description,
  // 响应式数组无法跨 contextBridge 克隆，必须展开
  trackIds: [...playlist.trackIds],
  cover: playlist.cover.kind === 'variant' ? playlist.cover.variant : '',
  eyebrow: playlist.eyebrow,
  custom: playlist.custom,
  createdAt: playlist.createdAt
})

/** 启动流程：拉取持久化状态并重建曲库。 */
export async function hydrateLibrary(): Promise<void> {
  const state = await window.shengyu.loadState()
  importedTracks.value = state.imported.map(toTrack)
  onlineTracks.value = (state.onlineTracks ?? []).map(onlineMetaToTrack)
  likedIds.value = new Set(state.liked)
  recent.value = state.recent
  customLyrics.value = { ...(state.lyricsTexts ?? {}) }
  chartSnapshots.value = { ...(state.chartSnapshots ?? {}) }
  const stats = state.playStats
  playStats.value = {
    // 旧档可能缺时段桶，补齐 24 位，否则画像页会算错
    hours: stats?.hours?.length === 24 ? [...stats.hours] : new Array(24).fill(0),
    genres: { ...(stats?.genres ?? {}) },
    artists: { ...(stats?.artists ?? {}) }
  }
  const savedPlaylists = state.playlists.map(
    (item): Playlist => ({
      ...item,
      cover: item.cover
        ? ({ kind: 'variant', variant: item.cover } as CoverSpec)
        : { kind: 'variant', variant: 'moss' }
    })
  )
  playlists.value = [...(savedPlaylists.length ? savedPlaylists : defaultPlaylists)]
  hydrated = true
}

export function recordPlay(trackId: string): void {
  const entry = recent.value.find((item) => item.id === trackId)
  if (entry) {
    entry.count += 1
    entry.at = Date.now()
  } else {
    recent.value.unshift({ id: trackId, at: Date.now(), count: 1 })
  }
  if (recent.value.length > 200) recent.value = recent.value.slice(0, 200)
  trackPlayStats(trackId)
  persist()
}

/**
 * 累加听歌画像的原始计数。
 *
 * 记录的是真实发生的事：几点听的、听的是什么流派、谁的歌。
 * 画像页只做聚合展示，不额外编造结论。
 */
function trackPlayStats(trackId: string): void {
  const track = trackById(trackId)
  if (!track) return
  const hour = new Date().getHours()
  if (hour >= 0 && hour < 24) playStats.value.hours[hour] += 1
  if (track.genre) {
    playStats.value.genres[track.genre] = (playStats.value.genres[track.genre] ?? 0) + 1
  }
  if (track.artist) {
    playStats.value.artists[track.artist] = (playStats.value.artists[track.artist] ?? 0) + 1
  }
}

/* ------------------------------ 榜单快照 ------------------------------ */

/**
 * 写入今天的名次快照；返回可用来做对比的**上一份**快照。
 *
 * 同一天不覆盖 —— 否则用户当天多刷几次榜单，快照就变成"刚刚"，
 * 升降全变 0，趋势列也就没意义了。
 */
export function commitChartSnapshot(
  key: string,
  ranks: Record<string, number>
): Record<string, number> | null {
  const today = new Date().toISOString().slice(0, 10)
  const previous = chartSnapshots.value[key]
  const usable = previous && previous.date !== today ? previous.ranks : null
  if (!previous || previous.date !== today) {
    chartSnapshots.value = { ...chartSnapshots.value, [key]: { date: today, ranks } }
    persist()
  }
  return usable
}

export const recentTracks = computed(() =>
  recent.value.map((entry) => trackById(entry.id)).filter((track): track is Track => Boolean(track))
)

export function clearRecent(): void {
  recent.value = []
  persist()
  window.ui?.toast?.('播放记录已清空', 'info')
}

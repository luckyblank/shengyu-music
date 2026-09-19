import type { ChartResult, OnlineTrackMeta } from '../shared/ipc'
import { CHART_GENRES, CHART_PERIODS, MEDIA_SCHEME } from '../shared/ipc'

/**
 * 在线榜单：Audius 官方 trending 榜单。
 *
 * 只取平台自己排的榜，**不做自由文本搜索** —— Audius 是开放上传平台，
 * 搜索会搜到用户盗传的版权曲目（实测搜「周杰伦」即有命中），榜单则不涉及这个问题。
 *
 * 音频与封面都不直接交给渲染层：Audius 的流地址会 302 到每个创作者节点各自的
 * 域名（实测出现 *.altego.net / *.open-audio-validator.com / *.staked.cloud /
 * *.r2.cloudflarestorage.com），既写不出可信的 CSP 白名单，也拿不到稳定的 CORS 头。
 * 因此统一改写成 shengyu-media://remote/ 代理地址，由主进程转发 Range 请求 ——
 * 渲染层只看到本地协议，CSP 保持收紧，同时拿到真实频谱与可拖动的进度条。
 */

const APP_NAME = 'shengyu'
const API = 'https://api.audius.co/v1'
const REQUEST_TIMEOUT = 12_000
const CACHE_TTL = 10 * 60 * 1000
/** 只收 8 分钟以内的曲目：榜单里混着整场 DJ set，收进来会毁掉播放队列。 */
const MAX_DURATION = 8 * 60
const LIMIT = 40
/** 代理封面取 480 档：覆盖列表卡片到播放页黑胶，再大纯属浪费带宽。 */
const COVER_SIZE = '480x480'

interface CacheEntry {
  at: number
  result: ChartResult
}

const cache = new Map<string, CacheEntry>()

/** 曲目 id 必须是 Audius 的短哈希，代理层据此拒绝任意字符串。 */
export const AUDIUS_ID_PATTERN = /^[A-Za-z0-9]{4,32}$/

export const REMOTE_KINDS = ['stream', 'cover'] as const
export type RemoteKind = (typeof REMOTE_KINDS)[number]

/** 生成走本地协议的代理地址；渲染层拿到的是这个，而不是 Audius 的原始地址。 */
export function toRemoteMediaUrl(trackId: string, kind: RemoteKind): string {
  return `${MEDIA_SCHEME}://remote/?id=${encodeURIComponent(trackId)}&kind=${kind}`
}

const apiUrl = (path: string, params: Record<string, string>): string => {
  const url = new URL(`${API}${path}`)
  url.searchParams.set('app_name', APP_NAME)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

interface AudiusTrack {
  id?: string
  title?: string
  duration?: number
  genre?: string
  play_count?: number
  favorite_count?: number
  repost_count?: number
  album_name?: string
  user?: { name?: string; handle?: string }
  artwork?: Record<string, string>
}

function pickArtwork(track: AudiusTrack): string {
  const art = track.artwork ?? {}
  return art[COVER_SIZE] ?? art['1000x1000'] ?? art['150x150'] ?? ''
}

function toTrackMeta(track: AudiusTrack, rank: number): OnlineTrackMeta | null {
  const id = track.id ?? ''
  const duration = track.duration ?? 0
  if (!id || !AUDIUS_ID_PATTERN.test(id)) return null
  if (!duration || duration > MAX_DURATION) return null

  return {
    id: `audius-${id}`,
    title: track.title?.trim() || '未命名曲目',
    artist: track.user?.name?.trim() || track.user?.handle || '未知音乐人',
    album: track.album_name?.trim() ?? '',
    duration,
    url: toRemoteMediaUrl(id, 'stream'),
    coverUrl: toRemoteMediaUrl(id, 'cover'),
    genre: track.genre ?? '',
    rank,
    playCount: track.play_count ?? 0,
    favoriteCount: track.favorite_count ?? 0,
    repostCount: track.repost_count ?? 0
  }
}

/**
 * 播放地址的上游 endpoint。
 *
 * 直接把 Range 头转给这个地址即可 —— 实测 Node fetch 跟随 302/307 跳转时
 * 会保留 Range，上游返回 206 + Content-Range，因此不必手动处理跳转链。
 * 真正的 CDN 域名（每首曲目都不同）永远不会暴露给渲染层。
 */
export function audiusStreamEndpoint(trackId: string): string {
  return apiUrl(`/tracks/${trackId}/stream`, {})
}

/**
 * 解析封面地址。重启后内存里没有映射，靠这一次查询恢复 ——
 * 不把会过期的节点地址持久化下来，否则下次启动必然 404。
 */
const coverCache = new Map<string, string>()

export async function resolveCoverUrl(trackId: string): Promise<string | null> {
  const cached = coverCache.get(trackId)
  if (cached) return cached
  if (!AUDIUS_ID_PATTERN.test(trackId)) return null
  try {
    const response = await fetch(apiUrl(`/tracks/${trackId}`, {}), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { data?: AudiusTrack }
    const art = payload.data ? pickArtwork(payload.data) : ''
    if (art) coverCache.set(trackId, art)
    return art || null
  } catch {
    return null
  }
}

export async function fetchChart(genreKey: string, periodKey: string): Promise<ChartResult> {
  const genre = CHART_GENRES.find((item) => item.key === genreKey)
  if (!genre) throw new Error(`不支持的流派：${genreKey}`)
  const period = CHART_PERIODS.find((item) => item.key === periodKey)
  if (!period) throw new Error(`不支持的周期：${periodKey}`)

  const key = `${genreKey}|${periodKey}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.result

  const params: Record<string, string> = { time: period.key, limit: String(LIMIT) }
  // Audius 不接受空 genre，全部榜就不带这个参数
  if (genre.genre) params.genre = genre.genre

  const response = await fetch(apiUrl('/tracks/trending', params), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  })
  if (!response.ok) throw new Error(`榜单接口返回 ${response.status}`)

  const payload = (await response.json()) as { data?: AudiusTrack[] }
  const raw = Array.isArray(payload.data) ? payload.data : []

  const tracks: OnlineTrackMeta[] = []
  const seenIds = new Set<string>()
  let skipped = 0
  for (const item of raw) {
    const meta = toTrackMeta(item, tracks.length + 1)
    // 单首不合格只跳过，不中断整个榜单
    if (!meta) {
      skipped += 1
      continue
    }
    // 上游有时把同一首排进榜两次；名次按去重后的顺序发，重复项直接不计
    if (seenIds.has(meta.id)) {
      skipped += 1
      continue
    }
    seenIds.add(meta.id)
    tracks.push(meta)
  }
  if (!tracks.length) throw new Error('这个榜单暂时没有可播放的曲目')

  const result: ChartResult = {
    key,
    genreLabel: genre.label,
    periodLabel: period.label,
    updatedAt: Date.now(),
    skipped,
    tracks
  }
  cache.set(key, { at: Date.now(), result })
  return result
}

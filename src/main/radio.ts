import type { RadioChannel, RadioChannelsResult } from '../shared/ipc'

/**
 * 声音频道：SomaFM 公开频道目录。
 *
 * SomaFM 是运行了二十多年的公播电台，46 个频道覆盖氛围、电子、爵士、世界音乐等。
 * 接口直接给出**实时在线人数**与频道简介，因此「136 人正在收听」是真的，不是装饰数字。
 *
 * 两个实测坑：
 *  - `listeners` 是**字符串**，不转 Number 直接相加会得到拼接的乱码；
 *  - 官方 `playlists` 字段给的是 .pls 播放列表文件，`<audio>` 播不了，
 *    必须自己按 `https://ice1.somafm.com/{id}-128-mp3` 构造直连流地址
 *    （已抽样验证冷门台同样可用）。
 */

const SOURCE = 'https://somafm.com/channels.json'
const REQUEST_TIMEOUT = 15_000
/** 频道列表变化很慢，但在线人数变化快，取一个折中值 */
const CACHE_TTL = 3 * 60 * 1000

/** SomaFM 的 genre 是 `ambient|electronic` 这种管道分隔串，按主类型归组。 */
const GENRE_GROUPS: Record<string, string> = {
  ambient: '氛围',
  electronic: '电子',
  jazz: '爵士',
  rock: '摇滚',
  alternative: '独立',
  metal: '金属',
  folk: '民谣',
  americana: '乡村',
  celtic: '凯尔特',
  world: '世界',
  bossanova: '波萨诺瓦',
  reggae: '雷鬼',
  tiki: '提基',
  lounge: '休闲',
  chill: '休闲',
  pop: '流行',
  oldies: '复古',
  '70s': '复古',
  hiphop: '嘻哈',
  spoken: '电台节目',
  news: '电台节目',
  specials: '特别节目',
  eclectic: '精选'
}

/** 分组展示顺序：内容优先，杂项靠后。 */
const GROUP_ORDER = [
  '氛围',
  '电子',
  '休闲',
  '爵士',
  '独立',
  '摇滚',
  '金属',
  '民谣',
  '乡村',
  '世界',
  '波萨诺瓦',
  '雷鬼',
  '提基',
  '嘻哈',
  '流行',
  '复古',
  '电台节目',
  '特别节目',
  '精选'
]

interface CacheEntry {
  at: number
  result: RadioChannelsResult
}

let cache: CacheEntry | null = null

interface SomaChannel {
  id?: string
  title?: string
  description?: string
  genre?: string
  dj?: string
  listeners?: string | number
  image?: string
  largeimage?: string
  lastPlaying?: string
}

function primaryGenre(raw: string): string {
  const first = raw.split('|')[0]?.trim().toLowerCase() ?? ''
  return GENRE_GROUPS[first] ?? '精选'
}

/**
 * 原始 genre 串 → 中文标签数组。
 * 保留接口顺序（SomaFM 把主类型放第一位），去重后交给卡片直接渲染。
 */
function genreLabels(raw: string): string[] {
  const labels = raw
    .split('|')
    .map((item) => GENRE_GROUPS[item.trim().toLowerCase()] ?? item.trim())
    .filter((item) => item.length > 0)
  return [...new Set(labels)]
}

function toChannel(raw: SomaChannel): RadioChannel | null {
  const id = raw.id?.trim()
  if (!id) return null
  return {
    id: `soma-${id}`,
    title: raw.title?.trim() || id,
    description: raw.description?.trim() || '',
    genre: primaryGenre(raw.genre ?? ''),
    genres: genreLabels(raw.genre ?? ''),
    dj: raw.dj?.trim() || '',
    // 必须转数字：接口给的是字符串
    listeners: Number(raw.listeners ?? 0) || 0,
    coverUrl: raw.largeimage || raw.image || '',
    // 官方 playlists 是 .pls 播放列表，这里按命名规则构造直连流
    url: `https://ice1.somafm.com/${id}-128-mp3`,
    lastPlaying: raw.lastPlaying?.trim() || ''
  }
}

export async function fetchRadioChannels(force = false): Promise<RadioChannelsResult> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.result

  const response = await fetch(SOURCE, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) })
  if (!response.ok) throw new Error(`电台目录返回 ${response.status}`)
  const payload = (await response.json()) as { channels?: SomaChannel[] }
  const raw = Array.isArray(payload.channels) ? payload.channels : []

  // 尽力而为：单个频道字段异常只跳过它，不拖垮整个目录
  const channels: RadioChannel[] = []
  for (const item of raw) {
    const channel = toChannel(item)
    if (channel) channels.push(channel)
  }
  if (!channels.length) throw new Error('电台目录为空')

  const groups = GROUP_ORDER.map((name) => ({
    name,
    channels: channels.filter((channel) => channel.genre === name)
  })).filter((group) => group.channels.length > 0)

  const result: RadioChannelsResult = {
    updatedAt: Date.now(),
    totalListeners: channels.reduce((sum, channel) => sum + channel.listeners, 0),
    groups,
    channels
  }
  cache = { at: Date.now(), result }
  return result
}

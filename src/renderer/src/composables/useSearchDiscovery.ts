import { computed, ref } from 'vue'
import { CHART_GENRES } from '@shared/ipc'
import {
  allTracks,
  likedIds,
  onlineMetaToTrack,
  playStats,
  playlists,
  recent,
  trackById
} from '../stores/library'
import { chartTrends, currentChart, hasTrendBase } from '../stores/online'
import { radioChannels } from '../stores/radio'
import * as player from '../stores/player'
import * as ui from '../stores/ui'
import type { AppPage, CoverSpec, Playlist, Track, TrackOrigin } from '../types/music'

/**
 * 搜索发现的数据层。
 *
 * 这里只做**派生**，原始信号全部来自真实发生的事：搜索历史、播放记录、收藏、
 * 在线榜单。任何一项没有数据时对应模块就隐藏，绝不编造一个「热门」「猜你喜欢」
 * 糊上去 —— 假数据能撑起界面，但撑不起信任。
 *
 * 放在模块级而不是工厂函数：搜索浮层与搜索页会同时用到同一批派生结果，
 * 模块级 computed 只算一次，两边还必然看到同一份数据。
 */

/* ------------------------------- 关键词匹配 ------------------------------- */

/** 流派 key → 中文名（与榜单同一份表，避免两处不一致）。 */
const GENRE_LABELS = new Map<string, string>(
  CHART_GENRES.map((item) => [item.genre, item.label] as const)
)

/**
 * 流派 → 情绪词。
 *
 * 情绪词只是**翻译**：每个情绪词背后都对应一个真实存在的流派字符串，
 * 点标签搜到的就是那个流派真正的曲目。表里没有的流派直接回落成流派原名，
 * 宁可朴素也不要有假标签。
 */
const GENRE_MOODS: Record<string, string> = {
  Pop: '治愈流行',
  Electronic: '律动电子',
  'Hip-Hop/Rap': '节拍嘻哈',
  Rock: '摇滚能量',
  'R&B/Soul': '温柔律动',
  Ambient: '氛围放松',
  House: '夜行浩室',
  Jazz: '爵士夜晚',
  Indie: '独立心情',
  'Lo-Fi': '轻音乐',
  Acoustic: '原声民谣',
  Classical: '古典时刻',
  Soundtrack: '电影原声',
  Techno: '地下电子',
  Trance: '迷幻节拍',
  'Drum & Bass': '疾速低音',
  'Deep House': '深夜浩室',
  Experimental: '实验声响',
  Dancehall: '舞池律动',
  Latin: '拉丁热浪'
}

/** 流派的中文名；不在表里的流派回落成原名。 */
export const genreLabel = (genre: string): string => GENRE_LABELS.get(genre) ?? genre

/** 流派的情绪词；不在表里的回落成中文名。 */
export const genreMood = (genre: string): string => GENRE_MOODS[genre] ?? genreLabel(genre)

/**
 * 曲目匹配。
 *
 * 除标题/歌手/专辑外还匹配**流派**（含中文名），否则「猜你喜欢」点进来的
 * 风格词在曲库里搜不到任何东西 —— 情绪标签就成了纯装饰。
 */
export function matchesTrack(track: Track, query: string): boolean {
  const fields = [track.title, track.artist, track.album]
  if (track.genre) fields.push(track.genre, genreLabel(track.genre))
  return fields.some((field) => field?.toLocaleLowerCase().includes(query))
}

/** 歌单匹配（标题/描述/副标题）。 */
export function matchesPlaylist(playlist: Playlist, query: string): boolean {
  return [playlist.title, playlist.description, playlist.eyebrow].some((field) =>
    field.toLocaleLowerCase().includes(query)
  )
}

/* --------------------------------- 查询态 -------------------------------- */

/** 归一化后的当前查询词；浮层与搜索页共用同一个判断 */
export const normalizedQuery = computed(() => ui.searchQuery.value.trim().toLocaleLowerCase())

export const matchedTracks = computed<Track[]>(() =>
  normalizedQuery.value
    ? allTracks.value.filter((track) => matchesTrack(track, normalizedQuery.value))
    : []
)

export const matchedPlaylists = computed<Playlist[]>(() =>
  normalizedQuery.value
    ? playlists.value.filter((playlist) => matchesPlaylist(playlist, normalizedQuery.value))
    : []
)

export interface ArtistHit {
  name: string
  count: number
}

/** 艺人结果：从曲库按艺人聚合，命中歌手名即算，顺带给出曲目数。 */
export const matchedArtists = computed<ArtistHit[]>(() => {
  const query = normalizedQuery.value
  if (!query) return []
  const counter = new Map<string, number>()
  for (const track of allTracks.value) {
    if (!track.artist) continue
    if (!track.artist.toLocaleLowerCase().includes(query)) continue
    counter.set(track.artist, (counter.get(track.artist) ?? 0) + 1)
  }
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

export const hasResult = computed(
  () => matchedTracks.value.length + matchedPlaylists.value.length + matchedArtists.value.length > 0
)

/* ------------------------------ 热搜榜 / 飙升榜 ------------------------------ */

/** 热搜榜条数：设计稿是 10 行一屏 */
const HOT_BOARD_LIMIT = 10
/** 飙升榜条数：设计稿是 5 行 */
const RISING_LIMIT = 5

export interface HotBoardItem {
  rank: number
  /** 点这一行会填进搜索框的关键词（这里用曲名，点播放按钮则直接听这首） */
  keyword: string
  track: Track
  heat: number
  /** 榜单内播放量最高的前两名，界面上给「爆」徽标 */
  boom: boolean
  /** 真实升降；没有历史基准时为 null，不伪造 NEW */
  trend: { kind: 'up' | 'down' | 'same' | 'new' | 'unknown'; delta: number } | null
}

/**
 * 热搜榜：直接取当前在线榜单的前 10 名。
 *
 * 关键词用**曲名**而不是歌手名：榜单每行一首、名次与热度都能对得上，
 * 用户点进来看到的就是刚看到的那个名次。
 */
export const hotBoard = computed<HotBoardItem[]>(() => {
  const chart = currentChart.value
  if (!chart) return []
  const trends = chartTrends.value
  const top = [...chart.tracks].sort((a, b) => a.rank - b.rank).slice(0, HOT_BOARD_LIMIT)
  // 「爆」只表示「这一屏里播放量最高」，取前两名 —— 界面上用 title 说明来路
  const boomIds = new Set(
    [...top]
      .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
      .slice(0, 2)
      .map((meta) => meta.id)
  )
  return top.map((meta, index) => ({
    rank: index + 1,
    keyword: meta.title,
    track: onlineMetaToTrack(meta),
    heat: meta.playCount ?? 0,
    boom: boomIds.has(meta.id),
    trend: trends[meta.id] ?? null
  }))
})

/** 热搜榜的来路说明，界面必须写清楚数据是哪来的。 */
export const hotBoardNote = computed(() => {
  const chart = currentChart.value
  if (!chart) return ''
  return hasTrendBase.value
    ? `来自${chart.genreLabel}榜 · ${chart.periodLabel}`
    : `来自${chart.genreLabel}榜 · 首次加载暂无升降`
})

export interface RisingItem {
  rank: number
  track: Track
  /** 名次前进的位数；没有历史基准时为 0，界面据此不画箭头 */
  delta: number
}

/**
 * 飙升榜：按榜单的真实名次升幅排序，最多 5 条。
 *
 * 显示「↑N 位」而不是「↑320%」：名次变化是我们真正掌握的数，百分比是编的。
 * 首日没有快照时升幅全是 unknown，这时退回「榜上前 5 首」并在标题里说明。
 */
export const risingItems = computed<RisingItem[]>(() => {
  const chart = currentChart.value
  if (!chart) return []
  const trends = chartTrends.value
  const ranked = [...chart.tracks].sort((a, b) => a.rank - b.rank)
  const ups = ranked
    .map((meta) => {
      const trend = trends[meta.id]
      return { meta, delta: trend && trend.kind === 'up' ? trend.delta : 0 }
    })
    .filter((item) => item.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.meta.rank - b.meta.rank)
  const list = ups.length
    ? ups.slice(0, RISING_LIMIT)
    : ranked.slice(0, RISING_LIMIT).map((meta) => ({ meta, delta: 0 }))
  return list.map((item, index) => ({
    rank: index + 1,
    track: onlineMetaToTrack(item.meta),
    delta: item.delta
  }))
})

export const risingNote = computed(() =>
  hasTrendBase.value ? '按今日真实名次升幅排序' : '首次加载还没有历史基准，先看榜上前 5 首'
)

/* ------------------------------- 猜你想搜 ------------------------------- */

export interface GuessItem {
  id: string
  /** 界面上的主文案（情绪词 / 歌手名） */
  label: string
  /** 实际填进搜索框的关键词 —— 一定是能搜到东西的真实流派名/歌手名 */
  keyword: string
  hint: string
}

/** 候选池比一屏能放的条数多，「换一换」才换得出真的新面孔 */
const GUESS_POOL_LIMIT = 18
const GUESS_SHOW = 6

const guessCursor = ref(0)

/**
 * 猜你想搜的候选池。
 *
 * 权重顺序就是「信号强度」：真实播放次数 > 收藏 > 曲库构成 > 在线榜单。
 * 榜单排在最后是刻意的 —— 它是最不「个人」的一条，只在前面信号不足时才露头，
 * 既保证冷启动不是空模块，又不会把榜单词顶到常听歌手前面。
 */
const guessPool = computed<GuessItem[]>(() => {
  const scores = new Map<string, number>()
  const plays = new Map<string, number>()
  const bump = (genre: string, by: number): void => {
    if (!genre) return
    scores.set(genre, (scores.get(genre) ?? 0) + by)
  }

  for (const [genre, count] of Object.entries(playStats.value.genres)) {
    bump(genre, count * 3)
    plays.set(genre, count)
  }
  for (const id of likedIds.value) {
    const track = trackById(id)
    if (track?.genre) bump(track.genre, 2)
  }
  for (const track of allTracks.value) if (track.genre) bump(track.genre, 1)

  const genres: GuessItem[] = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([genre]) => {
      const heard = plays.get(genre)
      return {
        id: `genre-${genre}`,
        label: genreMood(genre),
        keyword: genreLabel(genre),
        hint: heard ? `${genreLabel(genre)} · 听过 ${heard} 次` : `${genreLabel(genre)} · 曲库里有`
      }
    })

  const artists: GuessItem[] = Object.entries(playStats.value.artists)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([name, count]) => ({
      id: `artist-${name}`,
      label: name,
      keyword: name,
      hint: `常听 · 播放 ${count} 次`
    }))

  // 收藏本身就是明确的偏好，哪怕还没怎么播过
  const likedArtists = new Map<string, number>()
  for (const id of likedIds.value) {
    const track = trackById(id)
    if (!track?.artist) continue
    likedArtists.set(track.artist, (likedArtists.get(track.artist) ?? 0) + 1)
  }
  const liked: GuessItem[] = [...likedArtists.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([name, count]) => ({
      id: `liked-${name}`,
      label: name,
      keyword: name,
      hint: `已收藏 ${count} 首`
    }))

  const chartArtists: GuessItem[] = []
  for (const meta of currentChart.value?.tracks ?? []) {
    if (chartArtists.length >= 4) break
    if (!meta.artist) continue
    if (chartArtists.some((item) => item.keyword === meta.artist)) continue
    chartArtists.push({
      id: `chart-${meta.artist}`,
      label: meta.artist,
      keyword: meta.artist,
      hint: '榜单热门'
    })
  }

  // 同一个关键词只留信号最强的那条（顺序即优先级）
  const seen = new Set<string>()
  const pool: GuessItem[] = []
  for (const item of [...genres, ...artists, ...liked, ...chartArtists]) {
    const key = item.keyword.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    pool.push(item)
    if (pool.length >= GUESS_POOL_LIMIT) break
  }
  return pool
})

/** 猜你想搜：从候选池里取一屏 */
export const guessYouSearch = computed<GuessItem[]>(() => {
  const pool = guessPool.value
  if (pool.length <= GUESS_SHOW) return pool
  const start = guessCursor.value % pool.length
  const slice = pool.slice(start, start + GUESS_SHOW)
  // 游标滚到池尾时补齐开头几条，一屏永远是满的
  if (slice.length < GUESS_SHOW) slice.push(...pool.slice(0, GUESS_SHOW - slice.length))
  return slice
})

/** 换一换：只在候选池里滚动游标，不重新打分（否则每次都会跳回同一批） */
export function rotateGuess(): void {
  const size = guessPool.value.length
  if (size <= GUESS_SHOW) return
  guessCursor.value = (guessCursor.value + GUESS_SHOW) % size
}

/* ------------------------------ 相关搜索 / 专辑 ----------------------------- */

const RELATED_LIMIT = 8

/**
 * 相关搜索：从命中的曲目里反推出可继续搜的词。
 *
 * 全部由命中结果派生，因此每个词点下去都一定有结果 —— 相关搜索最忌讳给一个
 * 点了就空的词。歌手优先（命中越多说明这个词信息量越大），其次流派、专辑。
 */
export const relatedSearches = computed<string[]>(() => {
  const query = normalizedQuery.value
  if (!query) return []
  const artists = new Map<string, number>()
  const genres = new Map<string, number>()
  const albums = new Map<string, number>()
  for (const track of matchedTracks.value) {
    if (track.artist) artists.set(track.artist, (artists.get(track.artist) ?? 0) + 1)
    if (track.genre) {
      const label = genreLabel(track.genre)
      genres.set(label, (genres.get(label) ?? 0) + 1)
    }
    if (track.album) albums.set(track.album, (albums.get(track.album) ?? 0) + 1)
  }
  const ranked = (source: Map<string, number>): string[] =>
    [...source.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)

  const out: string[] = []
  const seen = new Set<string>([query])
  for (const name of [...ranked(artists), ...ranked(genres), ...ranked(albums)]) {
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length >= RELATED_LIMIT) break
  }
  return out
})

export interface AlbumHit {
  name: string
  artist: string
  cover: CoverSpec
  tracks: Track[]
}

/** 专辑结果：把命中的曲目按专辑名聚合，同一张专辑的曲目自然一起出现 */
export const matchedAlbums = computed<AlbumHit[]>(() => {
  const groups = new Map<string, AlbumHit>()
  for (const track of matchedTracks.value) {
    if (!track.album) continue
    const key = track.album.toLocaleLowerCase()
    const exists = groups.get(key)
    if (exists) {
      exists.tracks.push(track)
      continue
    }
    groups.set(key, {
      name: track.album,
      artist: track.artist,
      cover: track.cover,
      tracks: [track]
    })
  }
  return [...groups.values()].sort(
    (a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name)
  )
})

/** 电台结果：电台是直连流，只能按频道名/风格/简介这些文字信息匹配 */
export const matchedRadio = computed(() => {
  const query = normalizedQuery.value
  if (!query) return []
  return radioChannels.value.filter((channel) =>
    [channel.title, channel.genre, channel.description].some((field) =>
      field?.toLocaleLowerCase().includes(query)
    )
  )
})

/* ------------------------------- 排序与筛选 ------------------------------- */

export type SearchSort = 'relevant' | 'hot' | 'title'

export const SEARCH_SORTS: { key: SearchSort; label: string }[] = [
  { key: 'relevant', label: '最相关' },
  { key: 'hot', label: '最热' },
  { key: 'title', label: '歌曲名' }
]

export const searchSort = ref<SearchSort>('relevant')

/**
 * 相关性分数：标题命中最高，其次歌手、专辑，最后才是流派这类附带字段。
 * 完全相等额外加一大截 —— 「搜的歌名正好叫这个」应该排最前。
 */
function relevanceScore(track: Track, query: string): number {
  const title = track.title.toLocaleLowerCase()
  let score = 0
  if (title === query) score += 100
  else if (title.startsWith(query)) score += 60
  else if (title.includes(query)) score += 40
  if (track.artist.toLocaleLowerCase().includes(query)) score += 24
  if (track.album.toLocaleLowerCase().includes(query)) score += 12
  if (track.genre) {
    if (
      track.genre.toLocaleLowerCase().includes(query) ||
      genreLabel(track.genre).toLocaleLowerCase().includes(query)
    ) {
      score += 6
    }
  }
  return score
}

export const originFilter = ref<TrackOrigin[]>([])
export const likedOnly = ref(false)

export const filterCount = computed(() => originFilter.value.length + (likedOnly.value ? 1 : 0))

export function toggleOriginFilter(origin: TrackOrigin): void {
  const list = originFilter.value
  originFilter.value = list.includes(origin)
    ? list.filter((item) => item !== origin)
    : [...list, origin]
}

export function toggleLikedOnly(): void {
  likedOnly.value = !likedOnly.value
}

export function resetSearchFilters(): void {
  originFilter.value = []
  likedOnly.value = false
}

const filteredTracks = computed<Track[]>(() => {
  const origins = originFilter.value
  const onlyLiked = likedOnly.value
  return matchedTracks.value.filter((track) => {
    if (origins.length && !origins.includes(track.origin)) return false
    if (onlyLiked && !likedIds.value.has(track.id) && !track.liked) return false
    return true
  })
})

/**
 * 「最相关」的那一份排序。
 *
 * 与用户选的排序分开存放：最佳匹配卡永远取这一份，否则用户把排序切成「最热」时
 * 卡片会突然换人，「最佳匹配」这个说法就站不住了。
 */
const rankedTracks = computed<Track[]>(() => {
  const query = normalizedQuery.value
  return [...filteredTracks.value].sort(
    (a, b) =>
      relevanceScore(b, query) - relevanceScore(a, query) ||
      (b.playCount ?? 0) - (a.playCount ?? 0) ||
      a.id.localeCompare(b.id)
  )
})

/** 单曲结果：先筛选，再按用户选的排序 */
export const resultTracks = computed<Track[]>(() => {
  const list = [...filteredTracks.value]
  const query = normalizedQuery.value
  switch (searchSort.value) {
    case 'hot':
      return list.sort(
        (a, b) =>
          (b.playCount ?? 0) - (a.playCount ?? 0) ||
          relevanceScore(b, query) - relevanceScore(a, query)
      )
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    default:
      return rankedTracks.value
  }
})

export const bestMatch = computed<Track | null>(() => rankedTracks.value[0] ?? null)

/* -------------------------------- 结果分类 ------------------------------- */

export type SearchTab = 'all' | 'track' | 'artist' | 'album' | 'playlist' | 'lyric' | 'radio'

export const SEARCH_TABS: { key: SearchTab; label: string }[] = [
  { key: 'all', label: '综合' },
  { key: 'track', label: '单曲' },
  { key: 'artist', label: '歌手' },
  { key: 'album', label: '专辑' },
  { key: 'playlist', label: '歌单' },
  { key: 'lyric', label: '歌词' },
  { key: 'radio', label: '电台' }
]

export const searchTab = ref<SearchTab>('all')

export function setSearchTab(tab: SearchTab): void {
  searchTab.value = tab
}

/* -------------------------------- 可能喜欢 ------------------------------- */

/**
 * 不同来源的「发现价值」。
 *
 * 在线曲目优先：本地导入的是用户自己挑的，早就知道了；在线榜单与内置精选
 * 才是这个 APP 能替他发现的东西。
 */
const ORIGIN_DISCOVERY: Record<Track['origin'], number> = {
  remote: 3,
  demo: 2,
  local: 1,
  radio: 0
}

const RECOMMEND_LIMIT = 9
/** 右侧栏一屏放得下的条数 */
const LIKE_LIMIT = 3

/** 有没有足够的收听痕迹来支撑「可能喜欢」这个说法。 */
export const hasTasteProfile = computed(
  () => Object.keys(playStats.value.artists).length > 0 || likedIds.value.size > 0
)

/**
 * 可能喜欢：对全库按真实偏好打分后取前几首。
 *
 * 排序必须确定：等分时按播放量、再按 id 兜底，否则每次重算顺序都在抖，
 * 用户刚看到第四首、下一秒它跳到第一行。
 */
export const recommendedTracks = computed<Track[]>(() => {
  const played = new Set(recent.value.map((entry) => entry.id))
  const artists = playStats.value.artists
  const genres = playStats.value.genres
  const current = player.currentId.value
  const seen = new Set<string>()
  const scored: { track: Track; score: number }[] = []

  for (const track of allTracks.value) {
    if (track.id === current) continue
    if (likedIds.value.has(track.id)) continue
    // 同一首歌可能既有在线版又有本地版，按歌名+歌手去重，别一张列表里出现两遍
    const key = `${track.title}|${track.artist}`.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    let score = ORIGIN_DISCOVERY[track.origin] ?? 1
    score += Math.min(6, artists[track.artist] ?? 0) * 1.6
    if (track.genre) score += Math.min(5, genres[track.genre] ?? 0) * 1.2
    // 已经听过的不算「可能喜欢」，但要留一点分给「再听一次」
    if (played.has(track.id)) score -= 4
    scored.push({ track, score })
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.track.playCount ?? 0) - (a.track.playCount ?? 0) ||
        a.track.id.localeCompare(b.track.id)
    )
    .slice(0, RECOMMEND_LIMIT)
    .map((item) => item.track)
})

/** 推荐列表的来路说明：没有痕迹时说清楚为什么是这几首。 */
export const recommendNote = computed(() =>
  hasTasteProfile.value ? '根据你的播放与收藏' : '先随机挑几首，听过之后就会有依据'
)

/* ------------------------------ 右侧栏：可能喜欢 ----------------------------- */

const likeCursor = ref(0)

/**
 * 右栏的「你可能喜欢」：从推荐池里取 3 条，可换一换。
 *
 * 用滚动窗口而不是每次重新随机：窗口推进时上一批的尾巴还留在视野里，
 * 看得出来是同一份列表在往下走，不是内容被换掉了。
 */
export const likePicks = computed<Track[]>(() => {
  const pool = recommendedTracks.value
  if (pool.length <= LIKE_LIMIT) return pool
  const start = likeCursor.value % pool.length
  const slice = pool.slice(start, start + LIKE_LIMIT)
  if (slice.length < LIKE_LIMIT) slice.push(...pool.slice(0, LIKE_LIMIT - slice.length))
  return slice
})

export function rotateLike(): void {
  const size = recommendedTracks.value.length
  if (size <= LIKE_LIMIT) return
  likeCursor.value = (likeCursor.value + LIKE_LIMIT) % size
}

/* -------------------------------- 公共动作 ------------------------------- */

/**
 * 收起浮层，并把焦点从搜索框拿走。
 *
 * blur 是必须的：只关浮层的话光标还留在输入框里，用户接着打字屏幕上毫无反应，
 * 看上去就像应用卡住了。关浮层的三条路径（Esc / 点遮罩 / 点 ESC 徽标）都走这里。
 */
export function dismissSearch(): void {
  ui.closeSearch()
  document.querySelector<HTMLInputElement>('.search-field input')?.blur()
}

/**
 * 把关键词填进搜索框。
 *
 * 只填不跳转：浮层会立刻显示实时结果，用户还能接着改。
 * 真正跳转到结果页的是「查看全部」或回车 —— 那才需要清掉浮层。
 */
export function applyKeyword(keyword: string, remember = false): void {
  ui.searchQuery.value = keyword
  if (remember) ui.pushSearchHistory(keyword)
}

/** 进入完整搜索结果页。查询词在 search 页上不会被 navigate 清掉。 */
export function openAllResults(): void {
  const query = ui.searchQuery.value.trim()
  if (query) ui.pushSearchHistory(query)
  ui.closeSearch()
  ui.navigate('search')
}

/**
 * 用指定关键词进结果页，并落到指定分类。
 *
 * Tab 不随查询重置：用户点了「歌词」再看下一个词，多半还是想接着看歌词，
 * 每次都被踢回「综合」会让人反复重新点。切分类是用户显式的动作，只有他才能改。
 */
export function openResultsWith(keyword: string, tab: SearchTab = 'all'): void {
  const query = keyword.trim()
  if (!query) return
  ui.searchQuery.value = query
  ui.pushSearchHistory(query)
  setSearchTab(tab)
  ui.closeSearch()
  ui.navigate('search')
}

/** 打开歌手聚合页；顺带收起浮层，否则新页面被浮层盖着看不到。 */
export function openArtistPage(name: string): void {
  ui.artistPage.value = name
  ui.closeSearch()
  ui.navigate('artist')
}

/**
 * 从可见列表里点某一行播放。
 *
 * 整列表入队（而不是只播这一首）：搜索页点第三首后按「下一首」应该能接着听
 * 列表里的第四首。点正在播放的那首则是暂停 —— 行内按钮显示的是什么就做什么。
 */
export function playFromList(tracks: Track[], index: number): void {
  const track = tracks[index]
  if (!track) return
  if (track.id === player.currentId.value) {
    void player.toggle()
    return
  }
  void player.playTracks(tracks, 'search', index)
}

/** 打开歌单/页面后收起浮层：不然新内容被浮层压着，用户以为「点了没反应」。 */
export function openPage(page: AppPage): void {
  ui.closeSearch()
  ui.navigate(page)
}

export function openPlaylistPage(id: string): void {
  ui.closeSearch()
  ui.openPlaylist(id)
}

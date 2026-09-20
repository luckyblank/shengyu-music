import { computed, ref, shallowRef } from 'vue'
import { allTracks, customLyrics } from '../stores/library'
import { demoLyrics } from '../data/catalog'
import { parseLrc } from '../services/lrc'
import type { LyricLine, Track } from '../types/music'

/**
 * 歌词搜索的索引层。
 *
 * 仓库里**没有批量歌词接口** —— 内置演示曲的歌词在内存里（catalog），手动挂载的
 * 在 state.json 里，剩余的只能逐个读 `.lrc` 侧车文件（走 IPC）。因此这里的策略是
 * 「惰性 + 限量 + 分批」：
 *
 *  - 搜索页打开歌词分类（或用户输入了关键词）之前，一行文件都不读；
 *  - 侧车文件读取上限 `SIDECAR_LIMIT`，超出的曲目在覆盖度说明里如实报出来；
 *  - 每批 6 个并发，读完一批就把已索引文档推给 shallowRef，界面能边读边出结果。
 *
 * 绝不能改成启动时全量读盘：几千首本地曲目的歌词会把主进程 IPC 堵死，
 * 而这只是「歌词」这一个分类页需要的功能。
 */

/** 侧车文件读取上限，超出的曲目不索引（会在覆盖度说明里写明） */
const SIDECAR_LIMIT = 120
/** 每批并发读取数：再多只会把主进程的文件队列挤满，不会更快 */
const BATCH_SIZE = 6
/** 单个关键词最多返回多少首歌的命中 */
const HIT_LIMIT = 30

export interface LyricDoc {
  track: Track
  lines: LyricLine[]
}

export interface LyricHit {
  track: Track
  /** 命中的歌词原文 */
  line: string
  /** 该行的时间戳（毫秒），点进去直接跳到这一句 */
  time: number
}

/** 已索引的歌词文档；用 shallowRef 避免给每行歌词都套上响应式代理 */
const docs = shallowRef<LyricDoc[]>([])

/** 已经尝试过的曲目 id（含「确认没有歌词」的），防止反复读盘 */
const attempted = new Set<string>()

/** 请求过索引（界面据此决定要不要显示「正在读取歌词…」） */
const requested = ref(false)
const indexing = ref(false)
/** 有歌词的曲目数 / 可索引的候选总数 */
const indexedCount = ref(0)
const candidateCount = ref(0)
/** 因超出上限而未读取的候选数 */
const overflowCount = ref(0)

const formatStamp = (ms: number): string => {
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(2)
  return `${String(minutes).padStart(2, '0')}:${seconds.padStart(5, '0')}`
}

/** 能拿到歌词的曲目：内置演示曲、手动挂载、有 `.lrc` 侧车文件的本地曲目 */
function isCandidate(track: Track): boolean {
  if (customLyrics.value[track.id]) return true
  if (track.origin === 'demo' && demoLyrics[track.id]) return true
  return Boolean(track.lyricsPath)
}

function docFromText(track: Track, text: string, demo = false): LyricDoc | null {
  const lines = parseLrc(text, demo).lines.filter((line) => line.text.trim())
  return lines.length ? { track, lines } : null
}

/** 取一首曲目的歌词文本（内存优先，最后才读盘） */
async function readLyricsText(track: Track): Promise<{ text: string; demo: boolean } | null> {
  const custom = customLyrics.value[track.id]
  if (custom) return { text: custom, demo: false }
  const builtin = demoLyrics[track.id]
  if (builtin) {
    return {
      text: builtin.lines.map(([time, text]) => `[${formatStamp(time)}]${text}`).join('\n'),
      demo: true
    }
  }
  if (!track.lyricsPath) return null
  const text = await window.shengyu.readLyrics(track.lyricsPath)
  return text ? { text, demo: false } : null
}

let task: Promise<void> | null = null

/**
 * 建立歌词索引（幂等，可重入）。
 *
 * 返回同一个 promise，所以浮层与结果页同时调用只会真正扫一次盘。
 */
export function ensureLyricsIndex(): Promise<void> {
  if (task) return task
  requested.value = true
  const candidates = allTracks.value.filter(isCandidate)
  candidateCount.value = candidates.length
  // 内存里的歌词（演示曲 / 手动挂载）不受上限约束，只有读盘的侧车文件限量
  const memory = candidates.filter((track) => !track.lyricsPath || customLyrics.value[track.id])
  const sidecars = candidates
    .filter((track) => track.lyricsPath && !customLyrics.value[track.id])
    .slice(0, SIDECAR_LIMIT)
  overflowCount.value = Math.max(0, candidates.length - memory.length - sidecars.length)

  const pending = [...memory, ...sidecars].filter((track) => !attempted.has(track.id))
  indexing.value = true

  task = (async () => {
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (track) => {
          attempted.add(track.id)
          try {
            const raw = await readLyricsText(track)
            return raw ? docFromText(track, raw.text, raw.demo) : null
          } catch {
            // 单个曲目歌词读失败不能拖垮整批 —— 与库扫描、标签解析同一性质
            return null
          }
        })
      )
      const added = results.filter((doc): doc is LyricDoc => doc !== null)
      if (added.length) {
        docs.value = [...docs.value, ...added]
        indexedCount.value = docs.value.length
      }
    }
  })().finally(() => {
    indexing.value = false
  })
  return task
}

export const lyricIndexing = indexing
export const lyricIndexRequested = computed(() => requested.value)
export const lyricIndexReady = computed(() => requested.value && !indexing.value)

/** 覆盖度说明：必须如实写出「读到哪儿了」，不能让用户以为搜遍了全库。 */
export const lyricCoverageNote = computed(() => {
  if (!requested.value) return ''
  const parts: string[] = [`已索引 ${indexedCount.value} 首`]
  if (indexing.value) parts.push('正在读取歌词…')
  if (overflowCount.value > 0) parts.push(`另有 ${overflowCount.value} 首超出本次读取上限`)
  return parts.join(' · ')
})

/**
 * 歌词命中。
 *
 * 每首歌最多保留 2 行命中（副歌常重复，全列出来会把别首歌挤下去），
 * 命中行按「越靠前越优先」排序 —— 开头那句通常就是用户记得的那句。
 */
export function lyricHits(query: string): LyricHit[] {
  const keyword = query.trim().toLocaleLowerCase()
  if (!keyword) return []
  const hits: LyricHit[] = []
  for (const doc of docs.value) {
    let kept = 0
    for (const line of doc.lines) {
      if (kept >= 2) break
      if (!line.text.toLocaleLowerCase().includes(keyword)) continue
      hits.push({ track: doc.track, line: line.text, time: line.time })
      kept++
    }
    if (hits.length >= HIT_LIMIT) break
  }
  return hits
}

/** 歌词命中数（界面上的分类计数） */
export function lyricHitCount(query: string): number {
  return lyricHits(query).length
}

const quotes = ref<Record<string, string>>({})

/**
 * 为某首曲目取一句可展示的歌词，供最佳匹配卡与「热门歌词」卡引用。
 *
 * 优先返回含查询词的那一行（用户搜什么就给他看到什么），否则返回第一句
 * 有实义的歌词 —— 空字符串代表「确认没有歌词」，界面据此不显示引文行。
 */
export async function loadLyricQuote(track: Track, keyword = ''): Promise<string> {
  const cachedId = `${track.id}::${keyword.toLocaleLowerCase()}`
  const cached = quotes.value[cachedId]
  if (cached !== undefined) return cached
  let quote = ''
  try {
    const raw = await readLyricsText(track)
    if (raw) {
      const lines = parseLrc(raw.text, raw.demo)
        .lines.map((line) => line.text.trim())
        .filter(Boolean)
      const needle = keyword.trim().toLocaleLowerCase()
      const matched = needle
        ? lines.find((line) => line.toLocaleLowerCase().includes(needle))
        : undefined
      quote = matched ?? lines[0] ?? ''
    }
  } catch {
    quote = ''
  }
  quotes.value = { ...quotes.value, [cachedId]: quote }
  return quote
}

/** 已缓存的引文（同步读取，模板里直接用，避免每次渲染都发起一次异步） */
export function cachedQuote(trackId: string, keyword = ''): string {
  return quotes.value[`${trackId}::${keyword.toLocaleLowerCase()}`] ?? ''
}

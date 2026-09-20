import { computed, ref, watch } from 'vue'
import { CHART_GENRES, CHART_PERIODS, type ChartResult } from '@shared/ipc'
import {
  commitChartSnapshot,
  importOnlineTracks,
  onlineMetaToTrack,
  onlineTracks,
  transientTracks
} from './library'
import { currentId } from './player'
import * as ui from './ui'

/**
 * 在线榜单 store：按流派与周期拉取 Audius 官方 trending 榜单，并把曲目导入曲库。
 *
 * 取数在主进程完成（渲染层 CSP 不放行 connect-src），音频与封面也都由主进程代理，
 * 这里只负责缓存与视图状态。曲目是完整歌曲，不是试听片段。
 */

export const chartGenres = CHART_GENRES
export const chartPeriods = CHART_PERIODS

export const activeGenre = ref<string>(CHART_GENRES[0].key)
export const activePeriod = ref<string>(CHART_PERIODS[0].key)

const charts = ref<Record<string, ChartResult>>({})
/**
 * 上一次加载时的名次，仅用于算升降，不持久化。
 * 持久化的那份在 library 的 chartSnapshots，两者刻意分开：
 * 这里存的是「本次加载之前的旧榜」，写盘的那份是「今天的榜」。
 */
const trendBase = ref<Record<string, Record<string, number> | null>>({})
export const chartLoading = ref(false)
export const chartError = ref<string | null>(null)

const cacheKey = computed(() => `${activeGenre.value}|${activePeriod.value}`)

export const currentChart = computed<ChartResult | null>(() => charts.value[cacheKey.value] ?? null)

/** 拉取当前流派 + 周期的榜单；已有缓存且非强制刷新时直接复用。 */
export async function loadChart(force = false): Promise<void> {
  const key = cacheKey.value
  if (!force && charts.value[key]) return
  chartLoading.value = true
  chartError.value = null
  try {
    const result = await window.shengyu.fetchChart(activeGenre.value, activePeriod.value)
    charts.value = { ...charts.value, [key]: result }
    // 先取出上一次的名次快照（写入今天之前），再据此算真实升降
    const previous = commitChartSnapshot(
      key,
      Object.fromEntries(result.tracks.map((track) => [track.id, track.rank]))
    )
    trendBase.value = { ...trendBase.value, [key]: previous }
    // 与 [engine] RMS 同风格的埋点：只有这里能看出取数是否真的成功、过滤掉了几首
    console.log(
      `[online] 榜单 ${key} 加载完成：${result.tracks.length} 首，跳过 ${result.skipped}` +
        `，趋势基准 ${previous ? '有' : '无（首次加载，全部标 NEW）'}`
    )
  } catch (error) {
    chartError.value = (error as Error).message || '榜单加载失败'
    console.error(`[online] 榜单 ${key} 加载失败`, error)
  } finally {
    chartLoading.value = false
  }
}

/**
 * 名次趋势。
 *
 * 区分「无历史」与「新上榜」很重要：前者是**算不出来**，后者是**真的新进榜**。
 * 把前者也显示成 NEW 就是在编数据，所以首日一律给 unknown，由 UI 显示占位符。
 */
export type TrendKind = 'up' | 'down' | 'same' | 'new' | 'unknown'

export const chartTrends = computed<Record<string, { kind: TrendKind; delta: number }>>(() => {
  const base = trendBase.value[cacheKey.value] ?? null
  const trends: Record<string, { kind: TrendKind; delta: number }> = {}
  for (const track of currentChart.value?.tracks ?? []) {
    if (!base) {
      trends[track.id] = { kind: 'unknown', delta: 0 }
      continue
    }
    const before = base[track.id]
    if (before === undefined) {
      trends[track.id] = { kind: 'new', delta: 0 }
      continue
    }
    const delta = before - track.rank
    trends[track.id] = {
      kind: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
      delta: Math.abs(delta)
    }
  }
  return trends
})

/** 当天是否已有可对比的历史快照；没有时趋势列会整体标注说明。 */
export const hasTrendBase = computed(() => Boolean(trendBase.value[cacheKey.value]))

export function selectGenre(key: string): void {
  activeGenre.value = key
  void loadChart()
}

export function selectPeriod(key: string): void {
  activePeriod.value = key
  void loadChart()
}

/** 把当前榜单的全部曲目导入曲库（重复的自动跳过）。 */
export function importCurrentChart(): void {
  const chart = currentChart.value
  if (!chart) return
  const added = importOnlineTracks(chart.tracks)
  ui.toast(
    added ? `已导入 ${added} 首到曲库` : '这个榜单的曲目都已经在曲库里了',
    added ? 'success' : 'info'
  )
}

/**
 * 当前榜单临时并入曲库：让未导入的榜单曲目也能被 trackById 解析到。
 * 否则双击能出声，但播放条空白、行内收藏与「加入歌单」会写入死 id。
 */
watch(
  currentChart,
  (chart) => {
    transientTracks.value = (chart?.tracks ?? []).map(onlineMetaToTrack)
  },
  { immediate: true }
)

/**
 * 真正播放过的在线曲目自动落库。
 * 不这样做的话，切到别的流派后榜首那首会从曲库里消失，正在播放的播放条随即空白。
 */
watch(currentId, (id) => {
  if (!id?.startsWith('audius-')) return
  if (onlineTracks.value.some((track) => track.id === id)) return
  const meta = Object.values(charts.value)
    .flatMap((chart) => chart.tracks)
    .find((item) => item.id === id)
  if (meta) importOnlineTracks([meta])
})

/** 把榜单里的单首曲目加入曲库。 */
export function importOne(trackId: string): void {
  const meta = currentChart.value?.tracks.find((item) => item.id === trackId)
  if (!meta) return
  const added = importOnlineTracks([meta])
  ui.toast(added ? `已导入「${meta.title}」` : '这首歌已经在曲库里了', added ? 'success' : 'info')
}

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import SongRow from '../music/SongRow.vue'
import TrackMenu, { type TrackMenuState } from '../TrackMenu.vue'
import { playAll } from '../../composables/usePlaybackActions'
import {
  importOnlineTracks,
  onlineMetaToTrack,
  recent,
  likedTracks,
  importedTracks
} from '../../stores/library'
import * as online from '../../stores/online'
import * as player from '../../stores/player'
import * as ui from '../../stores/ui'
import type { Track } from '../../types/music'

/**
 * 排行榜 —— 版式对齐设计稿：面包屑 + 大标题 + 玫瑰头图卡，下面是药丸 tab 与表格。
 *
 * 在线榜单的趋势来自**真实的名次快照对比**：没有历史快照时显示占位符而不是编一个涨跌。
 * 设计稿里的原创榜 / ACG 榜 / 影视金曲榜在应用里没有数据源，所以不做，也不编曲目。
 */

/** 本地榜的 tab key；其余 key 都对应 Audius 流派（见 CHART_GENRES） */
const LOCAL_KEYS = ['new', 'hot', 'like'] as const
type LocalTab = (typeof LOCAL_KEYS)[number]

const isLocalKey = (key: string): key is LocalTab => (LOCAL_KEYS as readonly string[]).includes(key)

/** 常驻 tab：6 个在最小窗口（1120px）下也不折行，其余收进「更多」 */
const PRIMARY_TABS = [
  { key: 'all', label: '飙升榜' },
  { key: 'new', label: '新歌榜' },
  { key: 'hot', label: '热歌榜' },
  { key: 'hiphop', label: '说唱榜' },
  { key: 'electronic', label: '电音榜' },
  { key: 'pop', label: '流行榜' }
]

const MORE_TABS = [
  { key: 'like', label: '收藏榜' },
  { key: 'rock', label: '摇滚榜' },
  { key: 'rnb', label: 'R&B榜' },
  { key: 'ambient', label: '氛围榜' },
  { key: 'house', label: '浩室榜' },
  { key: 'jazz', label: '爵士榜' },
  { key: 'indie', label: '独立榜' }
]

const tab = ref('all')
const moreOpen = ref(false)

const localTab = computed(() => (isLocalKey(tab.value) ? tab.value : null))
const moreActive = computed(() => MORE_TABS.find((item) => item.key === tab.value) ?? null)

const selectTab = (key: string): void => {
  moreOpen.value = false
  tab.value = key
  // 本地榜不走在线取数；流派榜交给 store，缓存命中时它自己会跳过重复请求
  if (!isLocalKey(key)) online.selectGenre(key)
}

const onlineRows = computed(() => online.currentChart.value?.tracks ?? [])
const displayRows = computed(() => onlineRows.value.map(onlineMetaToTrack))

const trends = computed(() => online.chartTrends.value)

/** 本地曲目的播放次数，用来填热度列 —— 没有记录就是没有，不编一个数字出来 */
const localPlays = computed(() => {
  const counts = new Map<string, number>()
  for (const entry of recent.value) counts.set(entry.id, entry.count)
  return counts
})

const localHot = computed(() =>
  [...recent.value]
    .sort((a, b) => b.count - a.count || b.at - a.at)
    .map((entry) => entry.id)
    .map((id) => importedTracks.value.find((track) => track.id === id) ?? null)
    .filter((track): track is Track => Boolean(track))
    .slice(0, 30)
)
const localLike = computed(() => likedTracks.value.slice(0, 30))
const localNew = computed(() =>
  [...importedTracks.value].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 30)
)

const localRows = computed(() => {
  if (tab.value === 'hot') return localHot.value
  if (tab.value === 'like') return localLike.value
  return localNew.value
})

/** 一行说明数据口径 —— 本地榜与在线榜的排序依据完全不同，不写清楚容易被误读 */
const metaLine = computed(() => {
  if (tab.value === 'new') return '新歌榜 · 按加入曲库的时间排序 · 本地曲库'
  if (tab.value === 'hot') return '热歌榜 · 按本地播放次数排序 · 本地曲库'
  if (tab.value === 'like') return '收藏榜 · 你收藏过的曲目 · 本地曲库'
  return `${online.currentChartNote.value} · Audius 官方趋势榜`
})

/** 七天内加入曲库的本地曲目打「新歌」标；Track 没有发行日期，只能拿加入时间近似 */
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const badged = (track: Track): boolean => {
  if (isLocalKey(tab.value)) {
    return track.origin === 'local' && Date.now() - (track.addedAt ?? 0) < NEW_WINDOW_MS
  }
  return trends.value[track.id]?.kind === 'new'
}
const badgeFor = (track: Track): string => (badged(track) ? '新歌' : '')

const playChart = (): void => {
  const metas = onlineRows.value
  if (!metas.length) return
  const added = importOnlineTracks(metas)
  if (added) ui.toast(`已把 ${added} 首加入曲库并开始播放`, 'success')
  const tracks = metas.map((meta) => onlineMetaToTrack(meta))
  playAll(tracks, 'charts')
}

const playRow = (track: Track): void => {
  void player.playTrack(track)
}

const menu = ref<TrackMenuState | null>(null)
const openMenu = (track: Track, event: MouseEvent): void => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menu.value = { track, x: rect.left, y: rect.bottom + 4 }
}

/** 点空白处或按 Escape 收起「更多」—— 与 TrackMenu 同一套收尾逻辑 */
const onGlobalDown = (event: MouseEvent): void => {
  if (!(event.target as HTMLElement).closest('.chart-more')) moreOpen.value = false
}
const onGlobalKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') moreOpen.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onGlobalDown)
  document.addEventListener('keydown', onGlobalKeydown)
  // 其他页面可能已经改过 store 里的流派，先对齐再取数
  tab.value = online.activeGenre.value
  void online.loadChart()
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onGlobalDown)
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <section class="page-view">
    <header class="chart-head">
      <div class="chart-head-text">
        <p class="crumb">榜单</p>
        <h1>排行榜</h1>
        <p class="sub">用数据发现好音乐</p>
      </div>
      <!-- 设计稿里的头图卡是一张玫瑰色插画（照片），无法用代码复现，
           这里用同色系的渐变 + 抽象装饰替代 —— 这是本页唯一有意的偏离 -->
      <div class="hero-card">
        <svg class="hero-deco" viewBox="0 0 300 146" fill="none" aria-hidden="true">
          <circle cx="196" cy="96" r="72" stroke="currentColor" stroke-width="1.4" />
          <circle cx="196" cy="96" r="48" stroke="currentColor" stroke-width="1.4" />
          <path d="M4 100c30-16 50 8 80-8s50 6 80-10" stroke="currentColor" stroke-width="1.6" />
          <path d="M4 120c30-16 50 8 80-8s50 6 80-10" stroke="currentColor" stroke-width="1.2" />
          <path d="M4 140c30-16 50 8 80-8s50 6 80-10" stroke="currentColor" stroke-width="1" />
        </svg>
        <p class="hero-title">音乐热度榜</p>
        <p class="hero-sub">发现此刻最流行的声音</p>
      </div>
    </header>

    <div class="chart-tabs">
      <button
        v-for="item in PRIMARY_TABS"
        :key="item.key"
        class="chart-tab"
        :class="{ active: tab === item.key }"
        @click="selectTab(item.key)"
      >
        {{ item.label }}
      </button>

      <div class="chart-more">
        <button
          class="chart-tab more-btn"
          :class="{ active: Boolean(moreActive) }"
          aria-haspopup="true"
          :aria-expanded="moreOpen"
          @click="moreOpen = !moreOpen"
        >
          {{ moreActive ? moreActive.label : '更多' }}
          <AppIcon name="chevron-down" :size="13" />
        </button>
        <div v-if="moreOpen" class="more-menu" role="menu">
          <button
            v-for="item in MORE_TABS"
            :key="item.key"
            class="more-item"
            :class="{ active: tab === item.key }"
            role="menuitem"
            @click="selectTab(item.key)"
          >
            {{ item.label }}
          </button>
          <!-- 周期只对流派榜有意义：本地榜没有「本周 / 总榜」这回事 -->
          <template v-if="!localTab">
            <span class="more-sep"></span>
            <button
              v-for="item in online.chartPeriods"
              :key="item.key"
              class="more-item"
              :class="{ active: online.activePeriod.value === item.key }"
              role="menuitem"
              @click="online.selectPeriod(item.key)"
            >
              {{ item.label }}
            </button>
          </template>
        </div>
      </div>

      <div class="tab-actions">
        <template v-if="!localTab && displayRows.length">
          <button class="btn ghost" @click="online.importCurrentChart()">
            <AppIcon name="plus" :size="15" />导入曲库
          </button>
          <button class="btn primary" @click="playChart()">
            <AppIcon name="play" :size="15" />播放榜单
          </button>
        </template>
        <button
          v-else-if="localTab && localRows.length"
          class="btn primary"
          @click="playAll(localRows, 'library')"
        >
          <AppIcon name="play" :size="15" />播放榜单
        </button>
        <button
          v-if="!localTab"
          class="icon-button"
          aria-label="刷新榜单"
          :disabled="online.chartLoading.value"
          @click="online.loadChart(true)"
        >
          <AppIcon name="repeat" :size="15" />
        </button>
      </div>
    </div>

    <p class="chart-meta">{{ metaLine }}</p>

    <p v-if="!localTab && !online.hasTrendBase.value && displayRows.length" class="trend-note">
      首次加载这个榜单，还没有可对比的历史名次 —— 趋势列显示 <code>—</code>，
      明天再打开就会出现真实升降。新进榜的曲目标 <code>新歌</code>。
    </p>

    <div v-if="!localTab && online.chartLoading.value" class="state">
      <span class="spinner"></span>正在获取榜单…
    </div>

    <div v-else-if="!localTab && online.chartError.value" class="state error">
      <p>{{ online.chartError.value }}</p>
      <button class="btn ghost" @click="online.loadChart(true)">重试</button>
    </div>

    <!-- 表格：表头与数据行共用 --chart-cols，两边才分毫对齐 -->
    <div v-else-if="localTab ? localRows.length : displayRows.length" class="chart-table">
      <div class="chart-thead">
        <span class="th th-no">#</span>
        <span class="th th-song">歌曲</span>
        <span class="th th-artist">歌手</span>
        <span class="th th-album">专辑</span>
        <span class="th th-heat" title="热度取自平台播放量，暂不支持排序">
          热度<AppIcon name="chevron-down" :size="12" />
        </span>
        <span class="th th-duration">时长</span>
        <span class="th th-like"><AppIcon name="heart" :size="14" /></span>
        <span class="th th-more"><AppIcon name="more" :size="15" /></span>
      </div>

      <template v-if="localTab">
        <SongRow
          v-for="(track, index) in localRows"
          :key="track.id"
          variant="chart"
          :track="track"
          :index="index + 1"
          :heat="localPlays.get(track.id)"
          :badge="badgeFor(track)"
          show-album
          :active="player.currentId.value === track.id"
          @play="playRow"
          @menu="openMenu"
        />
      </template>
      <template v-else>
        <SongRow
          v-for="track in displayRows"
          :key="track.id"
          variant="chart"
          :track="track"
          use-rank
          :badge="badgeFor(track)"
          :trend="trends[track.id] ?? null"
          show-album
          :active="player.currentId.value === track.id"
          @play="playRow"
          @menu="openMenu"
        />
      </template>
    </div>

    <p v-else class="state">
      {{ localTab ? '这个榜单还是空的，先去听几首歌吧。' : '这个榜单是空的，换个流派或周期看看。' }}
    </p>

    <TrackMenu v-if="menu" :state="menu" @close="menu = null" />
  </section>
</template>

<style scoped>
.chart-head {
  display: flex;
  flex-wrap: wrap;
  gap: 28px 32px;
  align-items: center;
  justify-content: space-between;
  /* 设计稿量出的节奏：头图卡底边到药丸行只有 14px */
  margin-bottom: 14px;
}
.chart-head-text {
  min-width: 0;
}
.crumb {
  color: var(--brand);
  font-size: 14px;
}
.chart-head h1 {
  margin-top: 5px;
  color: var(--text-1);
  font-size: 56px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.chart-head .sub {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 20px;
}

.hero-card {
  position: relative;
  display: flex;
  overflow: hidden;
  flex: 0 1 694px;
  flex-direction: column;
  justify-content: center;
  min-width: 300px;
  padding-left: 40px;
  border-radius: var(--r-lg);
  /* 第一站取 --bg：浅色下左半段与页面底色连成一片，深色下自然从底色渗出来 */
  background: linear-gradient(
    100deg,
    var(--bg) 2%,
    var(--hero-chart-1) 46%,
    var(--hero-chart-2) 78%,
    var(--hero-chart-3) 100%
  );
  aspect-ratio: 694 / 146;
}
.hero-deco {
  position: absolute;
  top: 0;
  right: 6px;
  width: 300px;
  height: 100%;
  color: var(--hero-chart-ink);
  opacity: 0.16;
  pointer-events: none;
}
.hero-title {
  color: var(--text-1);
  font-size: 18px;
  font-weight: 600;
}
.hero-sub {
  margin-top: 4px;
  color: var(--text-2);
  font-size: 15px;
}

.chart-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  /* 药丸行下面到表头只有 6 + 一行说明 + 6 —— 合计约 28px，与设计稿的 28px 一致 */
  margin-bottom: 6px;
}
.chart-tab {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 42px;
  padding: 0 20px;
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: transparent;
  font-size: 15px;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.chart-tab:hover {
  color: var(--text-1);
}
.chart-tab.active {
  color: var(--brand);
  background: var(--brand-soft);
}

.chart-more {
  position: relative;
}
.more-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  display: flex;
  flex-direction: column;
  min-width: 148px;
  padding: 6px;
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
}
.more-item {
  padding: 8px 10px;
  border-radius: var(--r-sm);
  color: var(--text-2);
  background: transparent;
  font-size: 14px;
  text-align: left;
  transition: background var(--dur-1) ease;
}
.more-item:hover {
  color: var(--text-1);
  background: var(--surface-soft);
}
.more-item.active {
  color: var(--brand);
}
.more-sep {
  height: 1px;
  margin: 6px 4px;
  background: var(--divider);
}

.tab-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-left: auto;
}
.tab-actions .icon-button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: var(--r-md);
  color: var(--text-2);
  transition: color var(--dur-1) ease;
}
.tab-actions .icon-button:hover:not(:disabled) {
  color: var(--brand);
}

.chart-meta {
  /* 设计稿里药丸行与表头之间只有 28px，这行口径说明就挤在这段里，别把它撑高 */
  margin-bottom: 6px;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.3;
}

.trend-note {
  margin-bottom: 6px;
  padding: 10px 14px;
  border-radius: var(--r-md);
  color: var(--text-2);
  background: var(--surface-soft);
  font-size: 13px;
  line-height: 1.6;
}
.trend-note code {
  padding: 0 4px;
  border-radius: var(--r-xs);
  background: var(--surface);
  font-family: var(--font-mono);
}

/* 表头与数据行共用 --chart-cols / --chart-col-gap，列宽才对得齐 */
.chart-table {
  display: flex;
  flex-direction: column;
}
.chart-thead {
  display: grid;
  gap: 0 var(--chart-col-gap);
  align-items: center;
  min-height: 40px;
  padding: 0 10px;
  border-bottom: 1px solid var(--divider);
  grid-template-columns: var(--chart-cols);
  color: var(--text-3);
  font-size: 13px;
}
.th {
  white-space: nowrap;
}
/* 表头文字压在封面列上，与设计稿一致 */
.th-no {
  grid-column: 1;
}
.th-song {
  /* 设计稿的「歌曲」表头压在封面列上，所以从封面列起、跨到歌曲列 */
  grid-column: 2 / span 2;
}
.th-artist {
  grid-column: 4;
}
.th-album {
  grid-column: 5;
}
.th-heat {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  grid-column: 6;
}
/* 表头的箭头只是指示「热度有排序维度」，目前还不能点 */
.th-heat .app-icon {
  color: var(--brand);
}
.th-duration {
  grid-column: 7;
}
.th-like {
  display: grid;
  place-items: center;
  grid-column: 8;
}
.th-more {
  display: grid;
  place-items: center;
  grid-column: 9;
}

.state {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--text-3);
  font-size: 15px;
}
.state.error {
  flex-direction: column;
  color: var(--text-2);
}

.btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 34px;
  padding: 0 16px;
  border-radius: var(--r-md);
  font-size: 14px;
  transition: background var(--dur-1) ease;
}
.btn.primary {
  color: var(--on-brand);
  background: var(--brand);
}
.btn.primary:hover {
  background: var(--brand-hover);
}
.btn.ghost {
  border: 1px solid var(--divider);
  color: var(--text-1);
  background: var(--surface);
}
.btn.ghost:hover {
  background: var(--surface-soft);
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import { likedIds, toggleLike } from '../../stores/library'
import * as player from '../../stores/player'
import { formatPlays, formatTime } from '../../utils/format'
import type { Track } from '../../types/music'

/**
 * 曲目行 —— 全应用唯一的行样式。
 *
 * 刻意不用传统 table：整行是一个按钮，hover 才浮出操作。
 * 高度取 --row-h（64px），封面 40px，与设计规范的列表条目一致。
 */

export interface RowTrend {
  kind: 'up' | 'down' | 'same' | 'new' | 'unknown'
  delta: number
}

const props = withDefaults(
  defineProps<{
    track: Track
    /** 左侧序号；不传则不显示序号列 */
    index?: number
    active?: boolean
    /** 用榜单名次代替序号 */
    useRank?: boolean
    /** 显示专辑列 */
    showAlbum?: boolean
    /** 显示来源标签 */
    showOrigin?: boolean
    /** 显示在线数据（播放量/收藏人数） */
    showStats?: boolean
    /** 榜单升降 */
    trend?: RowTrend | null
    /**
     * chart：排行榜的表格行 —— 网格列 + 行分隔线，列序与榜单表头一致。
     * search：搜索结果表格行 —— 与 chart 共用「表格」样式，但列序里没有热度列。
     * 默认（default）是各页面通用的 flex 行，几种变体的样式互不影响。
     */
    variant?: 'default' | 'chart' | 'search'
    /** 热度数值，覆盖 track.playCount（本地榜用本地播放次数） */
    heat?: number
    /** 标题后的徽标，如「新歌」 */
    badge?: string
  }>(),
  {
    index: 0,
    active: false,
    useRank: false,
    showAlbum: false,
    showOrigin: false,
    showStats: false,
    trend: null,
    variant: 'default',
    heat: undefined,
    badge: ''
  }
)

const emit = defineEmits<{ play: [track: Track]; menu: [track: Track, event: MouseEvent] }>()

const liked = computed(() => likedIds.value.has(props.track.id))
const number = computed(() => (props.useRank ? props.track.rank ?? 0 : props.index))
/** 这一行正在出声：播放键据此显示暂停图标，否则按钮的样子和它点下去会做的事对不上 */
const playing = computed(() => props.active && player.isPlaying.value)
const chart = computed(() => props.variant === 'chart')
const search = computed(() => props.variant === 'search')
/** 表格变体（榜单 / 搜索结果）共用同一套网格骨架，只有列定义与每列列号不同 */
const table = computed(() => props.variant !== 'default')
/** 热度列的值：本地榜传本地播放次数，在线榜回落到平台播放量 */
const heatValue = computed(() => props.heat ?? props.track.playCount ?? 0)
/** 前两名用品牌色，与设计稿一致；其余名次保持三级文字 */
const topRanked = computed(() => chart.value && number.value > 0 && number.value <= 2)

/**
 * 序号位上浮出的播放键 —— 单击即播，而不是像整行那样要双击。
 *
 * 行的播放手势是双击，所以在双击的间隔内只认第一下：否则双击这个播放键会
 * 「先播又停」（第一下已开播，第二下就被 playTrack 当成同一首而切成了暂停）。
 */
const DOUBLE_CLICK_MS = 300
let lastToggleAt = 0

const togglePlay = (): void => {
  const now = Date.now()
  if (now - lastToggleAt < DOUBLE_CLICK_MS) return
  lastToggleAt = now
  emit('play', props.track)
}

const originLabel = computed(() => {
  switch (props.track.origin) {
    case 'local':
      return '本地'
    case 'demo':
      return '演示'
    case 'radio':
      return '电台'
    default:
      return props.track.genre || '在线'
  }
})

const trendLabel = computed(() => {
  const trend = props.trend
  if (!trend || trend.kind === 'unknown') return '—'
  if (trend.kind === 'new') return 'NEW'
  if (trend.kind === 'same') return '—'
  return String(trend.delta)
})
</script>

<template>
  <button
    class="song-row"
    :class="[{ current: active }, variant, { table }]"
    @dblclick="emit('play', track)"
    @keydown.enter="emit('play', track)"
  >
    <span v-if="number" class="row-number" :class="{ top: topRanked, bars: search && playing }">
      <span class="number-text">{{ String(number).padStart(2, '0') }}</span>
      <!-- 只做鼠标提示：整行本身已是 button，这里再挂 role/aria 会形成嵌套交互控件 -->
      <span
        class="number-play"
        aria-hidden="true"
        :title="playing ? '暂停' : '播放'"
        @click.stop="togglePlay"
        @dblclick.stop
      >
        <!-- 搜索结果里正在播的那一行用跳动条代替播放键，与设计稿一致 -->
        <span v-if="search && playing" class="number-bars" aria-hidden="true">
          <i /><i /><i />
        </span>
        <AppIcon v-else :name="playing ? 'pause' : 'play'" :size="14" :stroke-width="2.4" />
      </span>
    </span>

    <CoverArt :cover="track.cover" size="small" class="row-cover" />

    <span class="row-title">
      <strong :title="track.title">{{ track.title }}</strong>
      <small v-if="!table" :title="track.artist">{{ track.artist }}</small>
      <!-- 表格里升降与徽标紧跟在标题文字后（设计稿如此）；默认行里它们仍是独立列 -->
      <span v-else class="title-meta">
        <span v-if="trend" class="row-trend" :class="trend.kind" :title="`名次趋势：${trendLabel}`">
          <AppIcon
            v-if="trend.kind === 'up' || trend.kind === 'down'"
            :name="trend.kind === 'up' ? 'chevron-up' : 'chevron-down'"
            :size="12"
          />
          {{ trendLabel }}
        </span>
        <span v-if="badge" class="row-badge">{{ badge }}</span>
      </span>
    </span>

    <span v-if="table" class="row-artist" :title="track.artist">{{ track.artist || '—' }}</span>

    <span v-if="showAlbum" class="row-album" :title="track.album">
      {{ track.album || '—' }}
    </span>

    <span v-if="chart" class="row-heat" :title="heatValue ? `热度 ${heatValue}` : '暂无热度数据'">
      <AppIcon v-if="heatValue" class="heat-icon" name="fire" :size="13" />
      {{ heatValue ? formatPlays(heatValue) : '—' }}
    </span>

    <span v-if="showStats && !table" class="row-stats">
      <span v-if="track.playCount" class="stat" title="平台播放量">
        <AppIcon name="play" :size="11" />{{ formatPlays(track.playCount) }}
      </span>
      <span v-if="track.favoriteCount" class="stat" title="平台收藏人数">
        <AppIcon name="heart" :size="11" />{{ formatPlays(track.favoriteCount) }}
      </span>
    </span>

    <span
      v-if="trend && !table"
      class="row-trend"
      :class="trend.kind"
      :title="`名次趋势：${trendLabel}`"
    >
      <AppIcon
        v-if="trend.kind === 'up' || trend.kind === 'down'"
        :name="trend.kind === 'up' ? 'chevron-up' : 'chevron-down'"
        :size="12"
      />
      {{ trendLabel }}
    </span>

    <span v-if="showOrigin" class="row-origin">{{ originLabel }}</span>

    <span
      class="row-like"
      :class="{ active: liked }"
      role="button"
      :aria-label="liked ? '取消收藏' : '收藏'"
      @click.stop="toggleLike(track.id)"
    >
      <AppIcon name="heart" :size="15" />
    </span>

    <span class="row-duration">{{ formatTime(track.duration) }}</span>

    <span
      class="row-more"
      role="button"
      aria-label="更多操作"
      @click.stop="emit('menu', track, $event)"
    >
      <AppIcon name="more" :size="16" />
    </span>
  </button>
</template>

<style scoped>
/*
 * 用 flex 而不是固定列数的 grid：行会被放进整宽列表，也会被放进双列卡片，
 * 固定列在窄容器里会把标题挤没。flex 让可选列按内容出现，容器多窄都不塌。
 */
.song-row {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: var(--row-h);
  padding: 0 12px;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-2);
  text-align: left;
  transition: background var(--dur-1) ease;
}
/* 规范：hover 只给轻微底色，不做位移与阴影 */
.song-row:hover {
  background: var(--surface-hover);
}
.song-row.current {
  background: var(--brand-soft);
}
.song-row.current .row-title strong {
  color: var(--brand);
}

.row-number {
  position: relative;
  display: grid;
  width: 30px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 13px;
}
.number-play {
  display: none;
  color: var(--text-1);
}
.number-play:hover {
  color: var(--brand);
}
.song-row:hover .number-text {
  display: none;
}
.song-row:hover .number-play {
  display: inline-flex;
}

.row-cover {
  flex: 0 0 auto;
  border-radius: var(--r-sm);
}

.row-title {
  display: flex;
  min-width: 0;
  /* 唯一可伸缩的列：其余列按内容占位，标题吃掉剩余空间 */
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}
.row-title strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 15px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-title small {
  overflow: hidden;
  color: var(--text-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-album {
  overflow: hidden;
  flex: 0 1 20%;
  min-width: 0;
  color: var(--text-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-origin {
  overflow: hidden;
  flex: 0 0 auto;
  max-width: 90px;
  color: var(--text-3);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-stats {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 12px;
  align-items: center;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
}
.stat {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}

.row-trend {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 1px;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
}
.row-trend.up {
  color: var(--brand);
}
.row-trend.down {
  color: var(--success);
}
.row-trend.new {
  color: var(--brand);
  font-weight: 600;
}

.row-like,
.row-more {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--text-3);
  opacity: 0;
  transition:
    opacity var(--dur-1) ease,
    color var(--dur-1) ease;
}
/* 已收藏的红心常驻，不随 hover 显隐 */
.row-like.active {
  color: var(--brand);
  opacity: 1;
}
.song-row:hover .row-like,
.song-row:hover .row-more,
.row-like:focus-visible,
.row-more:focus-visible {
  opacity: 1;
}
.row-like:hover,
.row-more:hover {
  color: var(--text-1);
}
.row-like.active:hover {
  color: var(--brand-hover);
}

.row-duration {
  flex: 0 0 auto;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 13px;
  text-align: right;
}

/* ---------- 表格行（榜单 / 搜索结果共用一套骨架） ---------- */
/*
 * 列宽由 --chart-cols / --search-cols 分别给：表头与数据行同取一份定义，改一处两边一起对齐。
 * 每列都显式指定 grid-column，而不是靠 DOM 顺序自动排 —— 「专辑/来源」这些列
 * 是可选的，一旦某个 v-if 不成立，自动排版就会把后面的列整体左移串位；
 * 显式列号还让时长排在收藏之前（DOM 里收藏在前，是为了默认变体保持原样）。
 */
.song-row.table {
  display: grid;
  gap: 0 var(--chart-col-gap);
  align-items: center;
  min-height: var(--chart-row-h);
  padding: 0 10px;
  border-bottom: 1px solid var(--divider);
  border-radius: 0;
}
.song-row.chart {
  grid-template-columns: var(--chart-cols);
}
/* 搜索结果表格比榜单少一列热度，列号因此整体前移一列（时长 6 / 收藏 7 / 更多 8） */
.song-row.search {
  grid-template-columns: var(--search-cols);
}
/*
 * 每一列都显式钉在 grid-row: 1。DOM 里收藏排在时长之前（默认变体要的顺序），
 * 而网格的自动排版是按游标走的：列号一旦比游标靠前就换下一行 —— 只写
 * grid-column 会把时长和更多顶到第二行，行高也从 60 变成 73。
 */
.song-row.table .row-number {
  width: 100%;
  /* 设计稿里名次顶在行左内边距上，与表头 # 对齐，所以不再居中 */
  justify-items: start;
  grid-column: 1;
  grid-row: 1;
}
.song-row.table .row-cover {
  /* 设计稿封面 44px（比默认行的 small=48px 小一号） */
  width: 44px;
  height: 44px;
  grid-column: 2;
  grid-row: 1;
}
.song-row.table .row-title {
  display: flex;
  flex-direction: row;
  gap: 10px;
  align-items: center;
  grid-column: 3;
  grid-row: 1;
}
/* 设计稿的表格标题比默认行大半号 */
.song-row.table .row-title strong {
  flex: 0 1 auto;
  font-size: 16px;
}
/* 前两名的名次用品牌色，其余留给三级文字 */
.song-row.table .row-number.top {
  color: var(--brand);
}
.song-row.table .row-artist {
  grid-column: 4;
  grid-row: 1;
}
.song-row.table .row-album {
  grid-column: 5;
  grid-row: 1;
}
.song-row.chart .row-heat {
  gap: 6px;
  grid-column: 6;
  grid-row: 1;
}
/* 表格里时长左贴列首，且用二级文字色（默认行是右对齐的三级文字） */
.song-row.table .row-duration {
  color: var(--text-2);
  text-align: left;
  grid-row: 1;
}
.song-row.table .row-like,
.song-row.table .row-more {
  grid-row: 1;
}
.song-row.chart .row-duration {
  grid-column: 7;
}
.song-row.chart .row-like {
  grid-column: 8;
}
.song-row.chart .row-more {
  grid-column: 9;
}
.song-row.search .row-duration {
  grid-column: 6;
}
.song-row.search .row-like {
  grid-column: 7;
}
.song-row.search .row-more {
  grid-column: 8;
}

/* 表格里收藏与更多是常驻列（列位已经空出来了），不该再等 hover 才出现 */
.song-row.table .row-like,
.song-row.table .row-more {
  width: 100%;
  opacity: 1;
}

.row-title .title-meta {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
}
/* 设计稿里升降紧跟标题文字，所以不占固定宽度，让位给标题 */
.song-row.table .row-trend {
  min-width: auto;
}

/*
 * 正在播放的那一行用跳动条占用序号位列：表格里没有别的常驻位置能表达
 * 「就是这首在响」，而序号本身此时没有信息量。hover 时它同样可点（暂停）。
 */
.number-bars {
  display: inline-flex;
  gap: 2px;
  align-items: flex-end;
  height: 14px;
}
.number-bars i {
  width: 2px;
  height: 6px;
  border-radius: 1px;
  background: var(--brand);
  animation: row-bar 900ms ease-in-out infinite;
}
.number-bars i:nth-child(2) {
  animation-delay: 150ms;
}
.number-bars i:nth-child(3) {
  animation-delay: 300ms;
}
/* 播放中时跳动条常驻，不必等 hover —— 否则「哪首在响」就只有鼠标知道 */
.song-row.search .row-number.bars .number-text {
  display: none;
}
.song-row.search .row-number.bars .number-play {
  display: inline-flex;
}
@keyframes row-bar {
  0%,
  100% {
    height: 5px;
  }
  50% {
    height: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .number-bars i {
    height: 10px;
    animation: none;
  }
}
.row-badge {
  padding: 1px 6px;
  border-radius: var(--r-xs);
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
}

.row-artist {
  overflow: hidden;
  min-width: 0;
  color: var(--text-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-heat {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 13px;
}
.heat-icon {
  flex: 0 0 auto;
  color: var(--brand);
}
</style>

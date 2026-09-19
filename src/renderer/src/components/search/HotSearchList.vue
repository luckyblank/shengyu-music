<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import QuickPlayButton from './QuickPlayButton.vue'
import SectionHeading from '../music/SectionHeading.vue'
import { applyKeyword, hotSearchNote, hotSearches } from '../../composables/useSearchDiscovery'
import * as online from '../../stores/online'
import * as player from '../../stores/player'
import { formatPlays } from '../../utils/format'
import type { HotSearchItem } from '../../composables/useSearchDiscovery'

/**
 * 热门搜索 —— 取代原来的「热搜榜大列表」。
 *
 * 两列、每列三条，一屏就能读完；每行仍保留真实热度与升降趋势，但不再占满整屏。
 * 变更是刻意的：搜索页的读者目标明确，排行榜应该是「顺手扫一眼」而不是主角。
 */

interface TrendView {
  icon: string
  text: string
  tone: 'up' | 'flat' | 'down'
}

const trendOf = (item: HotSearchItem): TrendView => {
  if (!item.trend) return { icon: '', text: '', tone: 'flat' }
  switch (item.trend.kind) {
    case 'up':
      return { icon: 'chevron-up', text: `${item.trend.delta}`, tone: 'up' }
    case 'new':
      return { icon: '', text: '新上榜', tone: 'up' }
    case 'down':
      return { icon: 'chevron-down', text: `${item.trend.delta}`, tone: 'down' }
    default:
      // unknown：首次加载没有基准，显示破折号而不是伪造一个 NEW
      return { icon: '', text: '—', tone: 'flat' }
  }
}

const subtitleOf = (item: HotSearchItem): string => {
  const heat = formatPlays(item.heat)
  return heat ? `${item.hint} · ${heat}` : item.hint
}

const emptyText = computed(() => {
  if (online.chartLoading.value) return '正在读取榜单…'
  return online.chartError.value || '榜单暂时取不到，联网后会自动补上'
})

const isCurrent = (item: HotSearchItem): boolean => player.currentId.value === item.track.id
</script>

<template>
  <section class="block">
    <SectionHeading title="热门搜索" size="sm" :note="hotSearchNote" />

    <div v-if="hotSearches.length" class="hot-grid">
      <div v-for="item in hotSearches" :key="item.keyword" class="hot-item">
        <button
          class="hot-main"
          :title="`搜索「${item.keyword}」`"
          @click="applyKeyword(item.keyword)"
        >
          <span class="hot-rank" :class="{ top: item.rank <= 3 }">{{
            String(item.rank).padStart(2, '0')
          }}</span>
          <span class="hot-copy">
            <strong>{{ item.keyword }}</strong>
            <small>{{ subtitleOf(item) }}</small>
          </span>
          <span v-if="item.trend" class="hot-trend" :class="`tone-${trendOf(item).tone}`">
            <AppIcon v-if="trendOf(item).icon" :name="trendOf(item).icon" :size="12" />{{
              trendOf(item).text
            }}
          </span>
        </button>
        <QuickPlayButton
          :active="isCurrent(item)"
          :playing="player.isPlaying.value"
          :label="`播放 ${item.hint}`"
          @play="player.playTrack(item.track)"
          @pause="player.toggle()"
        />
      </div>
    </div>
    <p v-else class="empty">{{ emptyText }}</p>
  </section>
</template>

<style scoped>
.block {
  margin-bottom: 22px;
}

.hot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
  row-gap: 4px;
}
.hot-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  gap: 6px;
  align-items: center;
  padding: 2px 4px 2px 0;
  border-radius: var(--r-md);
  transition: background var(--dur-1) ease;
}
.hot-item:hover {
  background: var(--surface-hover);
}
.hot-item :deep(.quick-play) {
  opacity: 1;
}

.hot-main {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 5px 0 5px 8px;
  text-align: left;
}
/* 排名数字统一品牌红，前三名加粗提亮 —— 用不透明度而不是另给一个色值 */
.hot-rank {
  color: var(--brand);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  opacity: 0.5;
}
.hot-rank.top {
  font-weight: 600;
  opacity: 1;
}
.hot-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}
.hot-copy strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 13.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hot-copy small {
  overflow: hidden;
  color: var(--text-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hot-trend {
  display: inline-flex;
  gap: 1px;
  align-items: center;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.tone-up {
  color: var(--brand);
}
.tone-down,
.tone-flat {
  color: var(--text-3);
}

.empty {
  color: var(--text-3);
  font-size: 13px;
}
</style>

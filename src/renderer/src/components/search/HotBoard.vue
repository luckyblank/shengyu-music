<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import SectionHeading from '../music/SectionHeading.vue'
import {
  hotBoard,
  hotBoardNote,
  openPage,
  openResultsWith,
  playFromList
} from '../../composables/useSearchDiscovery'
import * as online from '../../stores/online'
import * as player from '../../stores/player'
import { formatPlays } from '../../utils/format'

/**
 * 热搜榜 —— 浮层左侧那一列。
 *
 * 数据就是当前在线榜单的前 10 名：名次、热度、升降都来自真实榜单，
 * 所以「热搜」这个词在这里没有注水。取不到榜单时给一句实话加一个重试，
 * 而不是拿本地曲库凑一个假的榜。
 */

const trendIcon = (kind: string): string =>
  kind === 'up' ? 'chevron-up' : kind === 'down' ? 'chevron-down' : ''

/** 点榜上某一行的播放键时，整榜入队 —— 按「下一首」应该接着听第 11 名，而不是停在这首 */
const boardTracks = computed(() => hotBoard.value.map((item) => item.track))
</script>

<template>
  <section class="board">
    <SectionHeading
      title="热搜榜"
      size="sm"
      :note="hotBoardNote"
      action="查看完整榜单"
      @action="openPage('charts')"
    />

    <ol v-if="hotBoard.length" class="board-list">
      <li v-for="item in hotBoard" :key="item.track.id" class="board-row">
        <span class="rank" :class="{ top: item.rank <= 3 }">{{ item.rank }}</span>
        <button
          class="word"
          :title="`搜索「${item.keyword}」`"
          @click="openResultsWith(item.keyword)"
        >
          <span class="word-text">{{ item.keyword }}</span>
          <span v-if="item.boom" class="tag boom" title="本榜播放量前二">爆</span>
          <span v-if="item.track.playCount" class="heat">{{
            formatPlays(item.track.playCount)
          }}</span>
        </button>
        <span class="side">
          <span
            v-if="item.trend && trendIcon(item.trend.kind)"
            class="trend"
            :class="item.trend.kind"
            :title="`名次变化 ${item.trend.delta} 位`"
          >
            <AppIcon :name="trendIcon(item.trend.kind)" :size="12" />
            {{ item.trend.delta }}
          </span>
          <button
            class="play"
            :title="
              player.currentId.value === item.track.id ? '暂停' : `播放《${item.track.title}》`
            "
            @click="playFromList(boardTracks, item.rank - 1)"
          >
            <AppIcon
              :name="
                player.currentId.value === item.track.id && player.isPlaying.value
                  ? 'pause'
                  : 'play'
              "
              :size="13"
              :stroke-width="2.4"
            />
          </button>
        </span>
      </li>
    </ol>

    <div v-else class="board-state">
      <p>{{ online.chartError.value || '正在拉取榜单…' }}</p>
      <button v-if="online.chartError.value" class="retry" @click="online.loadChart(true)">
        <AppIcon name="refresh" :size="12" />重试
      </button>
    </div>
  </section>
</template>

<style scoped>
.board {
  min-width: 0;
}

.board-list {
  display: flex;
  flex-direction: column;
}
.board-row {
  display: flex;
  gap: 10px;
  align-items: center;
  height: 34px;
  border-radius: var(--r-sm);
  transition: background var(--dur-1) ease;
}
.board-row:hover {
  background: var(--surface-hover);
}

.rank {
  width: 18px;
  flex: 0 0 auto;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 13px;
  text-align: center;
}
.rank.top {
  color: var(--brand);
}

.word {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  color: var(--text-2);
  background: transparent;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  transition: color var(--dur-1) ease;
}
.word:hover {
  color: var(--brand);
}
/* 关键词用省略号收口，爆 / 热度紧跟在文字后面；长标题不会把它们挤到看不见 */
.word-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag {
  flex: 0 0 auto;
  padding: 0 4px;
  border-radius: var(--r-xs);
  font-size: 11px;
  line-height: 16px;
}
.tag.boom {
  color: var(--brand);
  background: var(--brand-soft);
}

.heat {
  flex: 0 0 auto;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
}

.side {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
}
.trend {
  display: inline-flex;
  align-items: center;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
}
.trend.up {
  color: var(--brand);
}
.trend.down {
  color: var(--success);
}

/* 播放键常驻但隐形：位置不跳，hover 才亮起来 */
.play {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  color: var(--text-3);
  background: transparent;
  opacity: 0;
  transition:
    opacity var(--dur-1) ease,
    color var(--dur-1) ease;
}
.board-row:hover .play,
.play:focus-visible {
  opacity: 1;
}
.play:hover {
  color: var(--brand);
}
@media (hover: none) {
  .play {
    opacity: 1;
  }
}

.board-state {
  display: flex;
  gap: 10px;
  align-items: center;
  height: 120px;
  justify-content: center;
  color: var(--text-3);
  font-size: 13px;
}
.retry {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: var(--brand);
  background: transparent;
  font-size: 13px;
}
</style>

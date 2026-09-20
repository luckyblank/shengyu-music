<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import SectionHeading from '../music/SectionHeading.vue'
import {
  openPage,
  openResultsWith,
  playFromList,
  risingItems,
  risingNote
} from '../../composables/useSearchDiscovery'
import * as player from '../../stores/player'

/**
 * 飙升榜 —— 浮层右侧那一列。
 *
 * 只列真实名次上升的曲目，并直接标「↑N 位」。没有历史快照时（首次加载）
 * 升幅无从得知，这时退回榜上前 5 首，并在标题里写明原因 ——
 * 编一个「飙升 320%」比留白更糟。
 */

const risingTracks = computed(() => risingItems.value.map((item) => item.track))
</script>

<template>
  <section class="rising">
    <SectionHeading
      title="飙升榜"
      size="sm"
      :note="risingNote"
      action="查看完整榜单"
      @action="openPage('charts')"
    />

    <ol v-if="risingItems.length" class="rising-list">
      <li v-for="item in risingItems" :key="item.track.id" class="rising-row">
        <span class="rank" :class="{ top: item.rank <= 3 }">{{ item.rank }}</span>
        <span class="copy">
          <button
            class="title"
            :title="item.track.title"
            @click="openResultsWith(item.track.title)"
          >
            {{ item.track.title }}
          </button>
          <small :title="item.track.artist">{{ item.track.artist }}</small>
        </span>
        <span v-if="item.delta" class="delta" title="较上一期前进的名次">
          <AppIcon name="trend" :size="12" />{{ item.delta }}
        </span>
        <button
          class="play"
          :title="player.currentId.value === item.track.id ? '暂停' : `播放《${item.track.title}》`"
          @click="playFromList(risingTracks, item.rank - 1)"
        >
          <AppIcon
            :name="
              player.currentId.value === item.track.id && player.isPlaying.value ? 'pause' : 'play'
            "
            :size="13"
            :stroke-width="2.4"
          />
        </button>
      </li>
    </ol>

    <p v-else class="rising-state">暂时没有飙升数据，稍后刷新再看看。</p>
  </section>
</template>

<style scoped>
.rising {
  min-width: 0;
}

.rising-list {
  display: flex;
  flex-direction: column;
}
.rising-row {
  display: flex;
  gap: 10px;
  align-items: center;
  height: 34px;
  border-radius: var(--r-sm);
  transition: background var(--dur-1) ease;
}
.rising-row:hover {
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

.copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.title {
  overflow: hidden;
  padding: 0;
  color: var(--text-2);
  background: transparent;
  font-size: 13px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--dur-1) ease;
}
.title:hover {
  color: var(--brand);
}
.copy small {
  overflow: hidden;
  color: var(--text-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delta {
  display: inline-flex;
  gap: 1px;
  align-items: center;
  margin-left: auto;
  color: var(--brand);
  font-family: var(--font-mono);
  font-size: 12px;
}

.play {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  color: var(--text-3);
  background: transparent;
  opacity: 0;
  transition:
    opacity var(--dur-1) ease,
    color var(--dur-1) ease;
}
.rising-row:hover .play,
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

.rising-state {
  padding: 30px 0;
  color: var(--text-3);
  font-size: 13px;
  text-align: center;
}
</style>

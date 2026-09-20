<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import {
  likePicks,
  playFromList,
  recommendNote,
  rotateLike
} from '../../composables/useSearchDiscovery'
import * as player from '../../stores/player'
import { formatPlays } from '../../utils/format'

/**
 * 你可能喜欢 —— 结果页右栏。
 *
 * 与浮层里那一格共用同一份推荐池（recommendedTracks：按真实播放/收藏打分，
 * 在线优先于本地），所以两处看到的推荐是一回事。没有收听痕迹时标题下面
 * 那句说明会如实写出来，而不是假装「为你精选」。
 */

const isCurrent = (id: string): boolean => player.currentId.value === id
</script>

<template>
  <section v-if="likePicks.length" class="like">
    <div class="head">
      <h3>你可能喜欢</h3>
      <button class="swap" @click="rotateLike()">
        <AppIcon name="refresh" :size="12" />换一换
      </button>
    </div>
    <p class="note">{{ recommendNote }}</p>

    <ul class="list">
      <li v-for="(track, index) in likePicks" :key="track.id" class="row">
        <button class="main" :title="track.title" @click="playFromList(likePicks, index)">
          <CoverArt :cover="track.cover" size="tiny" />
          <span class="copy">
            <strong>{{ track.title }}</strong>
            <small>{{ track.artist }}</small>
          </span>
        </button>
        <span class="heat">
          <AppIcon v-if="track.playCount" class="fire" name="fire" :size="11" />
          {{ track.playCount ? formatPlays(track.playCount) : '' }}
        </span>
        <span v-if="isCurrent(track.id)" class="dot" :class="{ playing: player.isPlaying.value }">
          <i /><i /><i />
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head h3 {
  color: var(--text-1);
  font-size: 15px;
  font-weight: 600;
}
.swap {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: var(--text-3);
  background: transparent;
  font-size: 12px;
  transition: color var(--dur-1) ease;
}
.swap:hover {
  color: var(--brand);
}
.note {
  margin: 4px 0 12px;
  color: var(--text-3);
  font-size: 12px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.main {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  flex: 1 1 auto;
  padding: 6px;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  transition: background var(--dur-1) ease;
}
.main:hover {
  background: var(--surface-hover);
}
.copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.copy strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy small {
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heat {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  flex: 0 0 auto;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
}
.fire {
  color: var(--brand);
}

/* 正在播的那首用跳动条标出来，不用整行高亮 —— 右栏只是「猜」，别抢主列的注意力 */
.dot {
  display: inline-flex;
  gap: 2px;
  align-items: flex-end;
  height: 12px;
  flex: 0 0 auto;
}
.dot i {
  width: 2px;
  height: 5px;
  border-radius: 1px;
  background: var(--text-3);
}
.dot.playing i {
  background: var(--brand);
  animation: dot-bar 900ms ease-in-out infinite;
}
.dot.playing i:nth-child(2) {
  animation-delay: 150ms;
}
.dot.playing i:nth-child(3) {
  animation-delay: 300ms;
}
@keyframes dot-bar {
  0%,
  100% {
    height: 4px;
  }
  50% {
    height: 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dot.playing i {
    height: 10px;
    animation: none;
  }
}
</style>

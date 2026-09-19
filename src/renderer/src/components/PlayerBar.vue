<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'
import Visualizer from './Visualizer.vue'
import * as playerStore from '../stores/player'
import * as uiStore from '../stores/ui'
import { likedIds, toggleLike } from '../stores/library'

const {
  currentTrack,
  currentId,
  isPlaying,
  loading,
  duration,
  position,
  volume,
  muted,
  shuffled,
  repeatMode,
  queue
} = playerStore
const { equalizerOpen, queueOpen, lyricsOpen } = uiStore

const seeking = ref<number | null>(null)
const liked = computed(() => likedIds.value)

const displayPosition = computed(() => (seeking.value !== null ? seeking.value : position.value))
const progressPct = computed(() =>
  duration.value > 0 ? (displayPosition.value / duration.value) * 100 : 0
)
const volumePct = computed(() => (muted.value ? 0 : volume.value * 100))

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`
    : `${minutes}:${rest.toString().padStart(2, '0')}`
}

const onSeekInput = (event: Event): void => {
  seeking.value = Number((event.target as HTMLInputElement).value)
}
const onSeekCommit = (event: Event): void => {
  const value = Number((event.target as HTMLInputElement).value)
  seeking.value = null
  void playerStore.seek(value)
}
const onVolumeInput = (event: Event): void => {
  playerStore.setVolume(Number((event.target as HTMLInputElement).value) / 100)
}
/** 滚轮调音量：在音量滑杆/静音键上滚动即可微调 */
const onVolumeWheel = (event: WheelEvent): void => {
  event.preventDefault()
  const delta = event.deltaY > 0 ? -0.05 : 0.05
  playerStore.setVolume(Math.min(1, Math.max(0, volume.value + delta)))
}

const enterMini = (): void => {
  void window.shengyu.enterMini()
}
</script>

<template>
  <footer class="player-bar">
    <div class="now-playing">
      <button
        class="now-playing-cover"
        aria-label="打开播放页"
        @click="uiStore.togglePanel('nowPlaying')"
      >
        <CoverArt :cover="currentTrack?.cover" size="small" />
        <span class="cover-hover-hint"><AppIcon name="chevron-up" :size="16" /></span>
      </button>
      <div class="now-playing-copy">
        <strong>{{ currentTrack?.title ?? '未在播放' }}</strong>
        <span>{{ currentTrack ? currentTrack.artist : '从曲库选一首开始吧' }}</span>
      </div>
      <button
        class="icon-button subtle now-playing-like"
        :class="{ active: currentId && liked.has(currentId) }"
        aria-label="收藏当前歌曲"
        title="收藏"
        :disabled="!currentId"
        @click="currentId && toggleLike(currentId)"
      >
        <AppIcon name="heart" :size="15" />
      </button>
    </div>

    <div class="transport">
      <div class="transport-buttons">
        <button
          class="icon-button transport-secondary"
          :class="{ active: shuffled }"
          :aria-label="shuffled ? '关闭随机播放' : '随机播放'"
          @click="playerStore.toggleShuffle()"
        >
          <AppIcon name="shuffle" :size="17" />
        </button>
        <button
          class="icon-button transport-secondary"
          aria-label="上一首"
          title="上一首"
          @click="playerStore.previous()"
        >
          <AppIcon name="previous" :size="19" />
        </button>
        <button
          class="play-toggle"
          :class="{ loading: loading }"
          :aria-label="isPlaying ? '暂停' : '播放'"
          @click="playerStore.toggle()"
        >
          <span v-if="loading" class="spinner"></span>
          <AppIcon v-else :name="isPlaying ? 'pause' : 'play'" :size="20" :stroke-width="2.2" />
        </button>
        <button
          class="icon-button transport-secondary"
          aria-label="下一首"
          title="下一首"
          @click="playerStore.next()"
        >
          <AppIcon name="next" :size="19" />
        </button>
        <button
          class="icon-button transport-secondary"
          :class="{ active: repeatMode !== 'off' }"
          aria-label="循环模式"
          title="循环模式"
          @click="playerStore.cycleRepeat()"
        >
          <AppIcon :name="repeatMode === 'one' ? 'repeat-one' : 'repeat'" :size="17" />
        </button>
      </div>
      <div v-if="currentTrack?.origin === 'radio'" class="progress-row live-row">
        <span class="live-badge"><i></i> LIVE</span>
        <span class="live-station">{{ currentTrack.title }}</span>
        <span class="live-genre">{{ currentTrack.album }}</span>
      </div>
      <div v-else class="progress-row">
        <span>{{ formatTime(displayPosition) }}</span>
        <input
          class="range progress-range"
          type="range"
          min="0"
          :max="Math.max(duration, 1)"
          step="0.5"
          :value="displayPosition"
          :style="{ '--range-progress': `${progressPct}%` }"
          aria-label="播放进度"
          @input="onSeekInput"
          @change="onSeekCommit"
        />
        <span>{{ formatTime(duration) }}</span>
      </div>
    </div>

    <div class="player-tools">
      <div class="mini-spectrum" aria-hidden="true">
        <Visualizer :bars="26" :bar-width="2" :gap="3" :smoothing="0.5" />
      </div>
      <button
        class="icon-button subtle"
        :aria-label="muted ? '取消静音' : '静音'"
        title="滚轮调节音量"
        @click="playerStore.toggleMuted()"
        @wheel="onVolumeWheel"
      >
        <AppIcon :name="muted ? 'volume-mute' : 'volume'" :size="18" />
      </button>
      <input
        class="range volume-range"
        type="range"
        min="0"
        max="100"
        step="1"
        :value="volumePct"
        :style="{ '--range-progress': `${volumePct}%` }"
        aria-label="音量"
        title="滚轮调节音量"
        @input="onVolumeInput"
        @wheel="onVolumeWheel"
      />
      <button
        class="icon-button subtle"
        :class="{ active: equalizerOpen }"
        aria-label="均衡器"
        title="均衡器"
        @click="uiStore.togglePanel('equalizer')"
      >
        <AppIcon name="sliders" :size="18" />
      </button>
      <button
        class="icon-button subtle"
        :class="{ active: lyricsOpen }"
        aria-label="歌词"
        title="歌词"
        @click="uiStore.openCurrentLyrics()"
      >
        <AppIcon name="lyrics" :size="19" />
      </button>
      <button class="icon-button subtle" aria-label="迷你模式" title="迷你模式" @click="enterMini">
        <AppIcon name="mini" :size="17" />
      </button>
      <button
        class="icon-button subtle"
        :class="{ active: queueOpen }"
        aria-label="播放队列"
        title="播放队列 (Q)"
        @click="uiStore.togglePanel('queue')"
      >
        <AppIcon name="queue" :size="19" />
        <span v-if="queue.length" class="queue-badge">{{ queue.length }}</span>
      </button>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'
import * as playerStore from '../stores/player'
import { recentTracks as recentTracksComputed } from '../stores/library'
import type { QueueLabel } from '../types/music'

const { queueTracks, upNextTracks, queueIndex, queueLabel, currentTrack } = playerStore
const recentTracks = computed(() => recentTracksComputed.value)

const emit = defineEmits<{ close: [] }>()

const tab = ref<'next' | 'recent'>('next')
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

const labelText = computed(() => {
  const map: Record<QueueLabel, string> = {
    demo: '演示曲库',
    playlist: '歌单',
    library: '音乐库',
    album: '专辑',
    search: '搜索结果',
    single: '单曲',
    radio: '电台',
    charts: '在线榜单'
  }
  return map[queueLabel.value] ?? '播放列表'
})

const upcoming = computed(() => upNextTracks.value)
const historyTracks = computed(() => queueTracks.value.slice(0, Math.max(0, queueIndex.value)))

const queueStats = computed(() => {
  const count = queueTracks.value.length
  const totalSeconds = queueTracks.value.reduce((sum, track) => sum + (track.duration || 0), 0)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return { count, hours, minutes }
})

const formatTime = (seconds: number): string => {
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

const onDragStart = (index: number, event: DragEvent): void => {
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}
const onDragOver = (index: number, event: DragEvent): void => {
  event.preventDefault()
  overIndex.value = index
}
const onDrop = (index: number): void => {
  if (dragIndex.value !== null) {
    const offset = queueIndex.value + 1
    playerStore.reorderQueue(offset + dragIndex.value, offset + index)
  }
  dragIndex.value = null
  overIndex.value = null
}
const onDragEnd = (): void => {
  dragIndex.value = null
  overIndex.value = null
}
</script>

<template>
  <aside class="queue-panel">
    <div class="queue-header">
      <div>
        <span class="section-kicker">接下来播放</span>
        <h2>播放队列</h2>
      </div>
      <button
        class="icon-button panel-close"
        aria-label="关闭播放队列"
        title="关闭播放队列"
        @pointerdown.stop="emit('close')"
        @click.stop="emit('close')"
      >
        <AppIcon name="close" :size="22" />
      </button>
    </div>

    <p v-if="queueStats.count" class="queue-stats">
      共 {{ queueStats.count }} 首 · 总时长 {{ queueStats.hours }} 小时 {{ queueStats.minutes }} 分
    </p>

    <div class="queue-tabs">
      <button :class="{ active: tab === 'next' }" @click="tab = 'next'">队列</button>
      <button :class="{ active: tab === 'recent' }" @click="tab = 'recent'">最近播放</button>
    </div>

    <template v-if="tab === 'next'">
      <div class="queue-scroll">
        <div v-if="currentTrack" class="queue-current">
          <CoverArt :cover="currentTrack.cover" size="small" />
          <div class="queue-current-copy">
            <span class="queue-current-label">正在播放</span>
            <strong>{{ currentTrack.title }}</strong>
            <small>{{ currentTrack.artist }}</small>
          </div>
          <span class="playing-bars"><i></i><i></i><i></i></span>
        </div>

        <p class="queue-subhead">
          来自 {{ labelText }} · {{ upcoming.length }} 首待播
          <button class="text-button" @click="playerStore.clearQueue()">清空队列</button>
        </p>

        <div v-if="upcoming.length" class="queue-list">
          <div
            v-for="(track, index) in upcoming"
            :key="track.id"
            :class="['queue-track', { dragging: dragIndex === index, over: overIndex === index }]"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover="onDragOver(index, $event)"
            @drop="onDrop(index)"
            @dragend="onDragEnd"
            @dblclick="playerStore.playAt(queueIndex + 1 + index)"
          >
            <span class="drag-handle" aria-hidden="true"
              ><i></i><i></i><i></i><i></i><i></i><i></i
            ></span>
            <CoverArt :cover="track.cover" size="small" />
            <span class="queue-track-copy"
              ><strong>{{ track.title }}</strong
              ><small>{{ track.artist }}</small></span
            >
            <span class="queue-duration">{{ formatTime(track.duration) }}</span>
            <button
              class="icon-button subtle queue-remove"
              :aria-label="`从队列移除 ${track.title}`"
              @click="playerStore.removeFromQueue(queueIndex + 1 + index)"
            >
              <AppIcon name="close" :size="14" />
            </button>
          </div>
        </div>
        <div v-else class="queue-empty">
          <span class="empty-disc small"><i></i></span>
          <p>队列里没有待播歌曲</p>
          <small>在曲库里双击歌曲，或右键「加入播放队列」</small>
        </div>

        <template v-if="historyTracks.length">
          <p class="queue-subhead">已播放</p>
          <div class="queue-list history">
            <div
              v-for="(track, index) in historyTracks"
              :key="`${track.id}-${index}`"
              class="queue-track"
              @dblclick="playerStore.playAt(index)"
            >
              <span class="queue-history-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <CoverArt :cover="track.cover" size="small" />
              <span class="queue-track-copy"
                ><strong>{{ track.title }}</strong
                ><small>{{ track.artist }}</small></span
              >
              <span class="queue-duration">{{ formatTime(track.duration) }}</span>
            </div>
          </div>
        </template>
      </div>
    </template>

    <div v-else class="queue-scroll">
      <p class="queue-subhead">最近 30 天听过</p>
      <div v-if="recentTracks.length" class="queue-list recent-list">
        <div
          v-for="track in recentTracks"
          :key="track.id"
          class="queue-track recent-track"
          @dblclick="playerStore.playTrack(track)"
        >
          <CoverArt :cover="track.cover" size="small" />
          <span class="queue-track-copy"
            ><strong>{{ track.title }}</strong
            ><small>{{ track.artist }}</small></span
          >
          <span class="queue-duration">{{ formatTime(track.duration) }}</span>
        </div>
      </div>
      <div v-else class="queue-empty">
        <span class="empty-disc small"><i></i></span>
        <p>还没有播放记录</p>
      </div>
    </div>

    <div class="queue-footer">
      <button
        class="panel-close-button"
        @pointerdown.stop="emit('close')"
        @click.stop="emit('close')"
      >
        关闭 <AppIcon name="chevron-right" :size="14" />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.queue-stats {
  margin: -6px 4px 14px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.04em;
}
.queue-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 18px;
  padding: 4px;
  border-radius: 11px;
  background: var(--wash-1);
}
.queue-tabs button {
  font-size: 12.5px;
  flex: 1;
  height: 30px;
  border-radius: 8px;
  color: var(--text-dim);
  background: transparent;
  font-size: 12.5px;
  transition:
    background 160ms ease,
    color 160ms ease;
}
.queue-tabs button.active {
  color: var(--paper-100);
  background: var(--wash-3);
}
.queue-scroll {
  height: calc(100% - 118px);
  padding-right: 4px;
  overflow-y: auto;
}
.queue-current {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(239, 107, 79, 0.22);
  border-radius: 14px;
  background: rgba(239, 107, 79, 0.07);
}
.queue-current-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.queue-current-label {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 650;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.queue-current strong {
  margin-top: 3px;
  overflow: hidden;
  color: var(--paper-100);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-current small {
  color: var(--text-dim);
  font-size: 10px;
}
.queue-subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 24px 6px 12px;
  color: var(--text-dim);
  font-size: 10px;
}
.queue-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.queue-track {
  display: grid;
  grid-template-columns: 12px 40px minmax(0, 1fr) auto 28px;
  gap: 10px;
  align-items: center;
  min-height: 56px;
  padding: 6px 4px;
  border-radius: 12px;
  transition: background 150ms ease;
}
.queue-track.recent-track {
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 12px;
  min-height: 62px;
  padding: 8px 10px;
}
.recent-track .cover-art {
  width: 44px;
  height: 44px;
  border-radius: 10px;
}
.recent-track .queue-duration {
  min-width: 36px;
  color: var(--text-muted);
  text-align: right;
}
.queue-track:hover {
  background: var(--wash-2);
}
.queue-track.dragging {
  opacity: 0.45;
}
.queue-track.over {
  background: rgba(239, 107, 79, 0.1);
  box-shadow: inset 0 2px 0 var(--accent);
}
.queue-track .cover-art {
  width: 40px;
  height: 40px;
  border-radius: 9px;
}
.queue-track-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.queue-track-copy strong {
  font-size: 13px;
  overflow: hidden;
  color: var(--paper-200);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-track-copy small {
  color: var(--text-dim);
  font-size: 10px;
}
.queue-duration {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 9px;
}
.queue-remove {
  width: 24px;
  height: 24px;
  opacity: 0;
  transition: opacity 140ms ease;
}
.queue-track:hover .queue-remove {
  opacity: 1;
}
.drag-handle {
  display: grid;
  grid-template-columns: repeat(2, 2px);
  gap: 2px;
  justify-content: center;
  opacity: 0.35;
}
.drag-handle i {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
}
.queue-history-index {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 9px;
  text-align: center;
}
.queue-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 4px 0;
  border-top: 1px solid var(--hairline);
}
.queue-empty {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 220px;
  color: var(--text-dim);
  text-align: center;
}
.queue-empty p {
  margin-top: 4px;
  color: var(--paper-200);
  font-size: 13px;
}
.queue-empty small {
  margin-top: 6px;
  font-size: 10px;
}
.empty-disc.small {
  width: 60px;
  height: 60px;
  margin-bottom: 12px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import SectionHeading from '../music/SectionHeading.vue'
import SongList from '../music/SongList.vue'
import { playAll } from '../../composables/usePlaybackActions'
import { clearRecent, recent, recentTracks } from '../../stores/library'
import { relativeTime } from '../../utils/format'

/** 最近播放 —— 足迹。播放次数与最后聆听时间都来自真实记录。 */

const countOf = (id: string): number => recent.value.find((item) => item.id === id)?.count ?? 0
const atOf = (id: string): number => recent.value.find((item) => item.id === id)?.at ?? 0

const totalPlays = computed(() => recent.value.reduce((sum, item) => sum + item.count, 0))
</script>

<template>
  <section class="page-view">
    <header class="page-head">
      <div>
        <h1>最近播放</h1>
        <p>记录每首歌的播放次数与最后聆听时间，共 {{ totalPlays }} 次播放</p>
      </div>
      <div v-if="recentTracks.length" class="page-actions">
        <button class="btn ghost" @click="clearRecent()">
          <AppIcon name="trash" :size="15" />清空记录
        </button>
        <button class="btn primary" @click="playAll(recentTracks, 'library')">
          <AppIcon name="play" :size="15" />播放全部
        </button>
      </div>
    </header>

    <template v-if="recentTracks.length">
      <SectionHeading title="播放记录" :note="`${recentTracks.length} 首`" />
      <SongList :tracks="recentTracks" show-album show-origin />
      <ul class="meta-list">
        <li v-for="track in recentTracks.slice(0, 20)" :key="track.id">
          <span class="meta-title">{{ track.title }}</span>
          <span class="meta-count">听过 {{ countOf(track.id) }} 次</span>
          <span class="meta-time">{{ relativeTime(atOf(track.id)) }}</span>
        </li>
      </ul>
    </template>

    <p v-else class="state">还没有播放记录，听过的歌会出现在这里。</p>
  </section>
</template>

<style scoped>
.page-head {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 28px;
}
.page-head h1 {
  color: var(--text-1);
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.page-head p {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 15px;
}
.page-actions {
  display: flex;
  gap: 10px;
}

/* 播放细节单独一段：行内塞不下，但确实是有用的信息 */
.meta-list {
  margin-top: 26px;
  border-top: 1px solid var(--divider);
  list-style: none;
}
.meta-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 100px;
  gap: 14px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--divider);
  color: var(--text-2);
  font-size: 13px;
}
.meta-title {
  overflow: hidden;
  color: var(--text-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-count,
.meta-time {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
}
.meta-time {
  text-align: right;
}

.btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 36px;
  padding: 0 18px;
  border-radius: var(--r-md);
  font-size: 14px;
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
.state {
  padding: 70px 0;
  color: var(--text-3);
  font-size: 15px;
  text-align: center;
}
</style>

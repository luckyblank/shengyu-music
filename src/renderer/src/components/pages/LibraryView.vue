<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import SectionHeading from '../music/SectionHeading.vue'
import SongList from '../music/SongList.vue'
import { playAll } from '../../composables/usePlaybackActions'
import {
  allTracks,
  importViaPicker,
  importedTracks,
  importing,
  onlineTracks,
  removeFromLibrary
} from '../../stores/library'
import { demoTracks, remoteTracks } from '../../data/catalog'
import type { Track } from '../../types/music'

/** 本地音乐 —— 已从「我的音乐」移到工具区，定位是文件管理而非日常入口。 */

type Filter = 'all' | 'local' | 'online'
type SortField = 'title' | 'artist' | 'duration' | 'added'

const filter = ref<Filter>('all')
const sortField = ref<SortField>('added')
const sortDir = ref<'asc' | 'desc'>('desc')

const source = computed<Track[]>(() => {
  if (filter.value === 'local') return importedTracks.value
  if (filter.value === 'online') return onlineTracks.value
  return allTracks.value
})

const rows = computed(() => {
  const factor = sortField.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...source.value].sort((a, b) => {
    switch (factor) {
      case 'title':
        return a.title.localeCompare(b.title, 'zh-Hans-CN') * dir
      case 'artist':
        return a.artist.localeCompare(b.artist, 'zh-Hans-CN') * dir
      case 'duration':
        return (a.duration - b.duration) * dir
      default:
        return ((a.addedAt ?? 0) - (b.addedAt ?? 0)) * dir
    }
  })
})

const setSort = (field: SortField): void => {
  if (sortField.value === field) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}

const dropTrack = (track: Track): void => {
  void removeFromLibrary(track.id)
}
</script>

<template>
  <section class="page-view">
    <header class="page-head">
      <div>
        <h1>本地音乐</h1>
        <p>
          本地导入 {{ importedTracks.length }} 首 · 在线收藏 {{ onlineTracks.length }} 首 · 演示
          {{ demoTracks.length }} 首 · 内置在线 {{ remoteTracks.length }} 首
        </p>
      </div>
      <div class="page-actions">
        <button class="btn ghost" :disabled="importing" @click="importViaPicker('folder')">
          <AppIcon name="folder" :size="15" />{{ importing ? '扫描中…' : '导入文件夹' }}
        </button>
        <button class="btn primary" :disabled="importing" @click="importViaPicker('files')">
          <AppIcon name="file" :size="15" />{{ importing ? '导入中…' : '导入文件' }}
        </button>
      </div>
    </header>

    <div class="toolbar">
      <div class="chips">
        <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button :class="{ active: filter === 'local' }" @click="filter = 'local'">本地</button>
        <button :class="{ active: filter === 'online' }" @click="filter = 'online'">在线</button>
      </div>
      <button class="sort" @click="setSort('title')">
        标题<AppIcon
          v-if="sortField === 'title'"
          :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'"
          :size="11"
        />
      </button>
      <button class="sort" @click="setSort('artist')">
        歌手<AppIcon
          v-if="sortField === 'artist'"
          :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'"
          :size="11"
        />
      </button>
      <button class="sort" @click="setSort('duration')">
        时长<AppIcon
          v-if="sortField === 'duration'"
          :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'"
          :size="11"
        />
      </button>
      <button class="sort" @click="setSort('added')">
        最近添加<AppIcon
          v-if="sortField === 'added'"
          :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'"
          :size="11"
        />
      </button>
      <button class="btn ghost play-all" @click="playAll(rows, 'library')">
        <AppIcon name="play" :size="14" />播放全部
      </button>
    </div>

    <SectionHeading v-if="rows.length" title="全部音乐" :note="`${rows.length} 首`" />

    <SongList v-if="rows.length" :tracks="rows" show-album show-origin @remove="dropTrack" />

    <p v-else class="state">曲库还是空的，点右上角导入，或直接把音频文件拖进窗口。</p>
  </section>
</template>

<style scoped>
.page-head {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 24px;
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

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 28px;
}
.chips {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: var(--r-md);
  background: var(--surface-soft);
}
.chips button {
  padding: 5px 12px;
  border-radius: var(--r-sm);
  color: var(--text-2);
  background: transparent;
  font-size: 13px;
}
.chips button.active {
  color: var(--text-1);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}
.sort {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  color: var(--text-2);
  background: transparent;
  font-size: 13px;
}
.sort:hover {
  color: var(--text-1);
}
.play-all {
  margin-left: auto;
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
.btn.ghost:hover:not(:disabled) {
  background: var(--surface-soft);
}
.btn:disabled {
  opacity: 0.6;
}

.state {
  padding: 70px 0;
  color: var(--text-3);
  font-size: 15px;
  text-align: center;
}
</style>

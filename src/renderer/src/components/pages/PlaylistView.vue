<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import SongList from '../music/SongList.vue'
import { playPlaylist, playlistCover } from '../../composables/usePlaybackActions'
import {
  deletePlaylist,
  playlists,
  removeFromPlaylist,
  renamePlaylist,
  tracksOfPlaylist
} from '../../stores/library'
import * as ui from '../../stores/ui'
import type { Track } from '../../types/music'

/** 歌单详情。守卫不成立时给显式空态 —— 不能落回设置页。 */

const playlist = computed(() =>
  playlists.value.find((item) => item.id === ui.currentPlaylistId.value)
)

const tracks = computed<Track[]>(() => (playlist.value ? tracksOfPlaylist(playlist.value) : []))

const rename = (): void => {
  if (!playlist.value) return
  const next = window.prompt('重命名歌单', playlist.value.title)
  if (next?.trim()) renamePlaylist(playlist.value.id, next.trim())
}

const remove = async (): Promise<void> => {
  if (!playlist.value) return
  const ok = await window.ui?.ask?.('删除歌单', `确定删除「${playlist.value.title}」吗？`)
  if (!ok) return
  deletePlaylist(playlist.value.id)
  ui.currentPlaylistId.value = null
  ui.navigate('library')
}

const dropTrack = (track: Track): void => {
  if (playlist.value) removeFromPlaylist(playlist.value.id, track.id)
}
</script>

<template>
  <section class="page-view">
    <p v-if="!playlist" class="state">没有打开中的歌单。到左侧「我的歌单」里选一个，或新建一个。</p>

    <template v-else>
      <header class="pl-head">
        <CoverArt :cover="playlistCover(playlist)" size="large" class="pl-cover" />
        <div class="pl-copy">
          <span class="kicker">{{ playlist.eyebrow }}</span>
          <h1>{{ playlist.title }}</h1>
          <p>{{ playlist.description }}</p>
          <span class="pl-meta">
            {{ playlist.trackIds.length }} 首 ·
            {{ playlist.custom ? '自建歌单' : '内置歌单' }}
          </span>
          <div class="pl-actions">
            <button class="btn primary" @click="playPlaylist(playlist)">
              <AppIcon name="play" :size="15" />播放歌单
            </button>
            <template v-if="playlist.custom">
              <button class="btn ghost" @click="rename()">
                <AppIcon name="edit" :size="14" />重命名
              </button>
              <button class="btn ghost danger" @click="remove()">
                <AppIcon name="trash" :size="14" />删除
              </button>
            </template>
          </div>
        </div>
      </header>

      <SongList
        v-if="tracks.length"
        :tracks="tracks"
        show-album
        show-origin
        removable
        @remove="dropTrack"
      />

      <p v-else class="state">歌单还是空的，在任意曲目的右键菜单里选「添加到歌单」。</p>
    </template>
  </section>
</template>

<style scoped>
.pl-head {
  display: flex;
  gap: 26px;
  align-items: flex-end;
  margin-bottom: 36px;
}
.pl-cover {
  flex: 0 0 auto;
}
.pl-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.kicker {
  color: var(--brand);
  font-size: 13px;
  font-weight: 600;
}
.pl-copy h1 {
  margin-top: 4px;
  color: var(--text-1);
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.pl-copy p {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 15px;
}
.pl-meta {
  margin-top: 6px;
  color: var(--text-3);
  font-size: 13px;
}
.pl-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
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
.btn.ghost.danger {
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 40%, var(--divider));
}
.state {
  padding: 70px 0;
  color: var(--text-3);
  font-size: 15px;
  text-align: center;
}
</style>

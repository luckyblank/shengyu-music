<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import HotSearchList from './HotSearchList.vue'
import SearchSongItem from './SearchSongItem.vue'
import SectionHeading from '../music/SectionHeading.vue'
import {
  hasResult,
  matchedArtists,
  matchedPlaylists,
  matchedTracks,
  openAllResults,
  openArtistPage,
  openPlaylistPage,
  playFromList
} from '../../composables/useSearchDiscovery'
import * as player from '../../stores/player'
import * as ui from '../../stores/ui'
import type { Playlist } from '../../types/music'

/**
 * 输入中的实时结果。
 *
 * 每类只露前几条 + 一个「查看全部」——浮层是预览，不是结果页。
 * 一屏塞满上百条命中会让用户以为自己在读数据库，而这正是要消灭的感觉。
 */

const TRACK_LIMIT = 5
const PLAYLIST_LIMIT = 4
const ARTIST_LIMIT = 6

const tracks = computed(() => matchedTracks.value.slice(0, TRACK_LIMIT))
const playlists = computed(() => matchedPlaylists.value.slice(0, PLAYLIST_LIMIT))
const artists = computed(() => matchedArtists.value.slice(0, ARTIST_LIMIT))

/** 显示用的原始查询词（normalizedQuery 是小写归一化过的，不能直接上屏）。 */
const keyword = computed(() => ui.searchQuery.value.trim())

const countLine = computed(() => {
  const parts: string[] = []
  if (matchedTracks.value.length) parts.push(`${matchedTracks.value.length} 首歌`)
  if (matchedArtists.value.length) parts.push(`${matchedArtists.value.length} 位歌手`)
  if (matchedPlaylists.value.length) parts.push(`${matchedPlaylists.value.length} 个歌单`)
  return parts.join(' · ')
})

const playlistMeta = (playlist: Playlist): string =>
  `${playlist.trackIds.length} 首` + (playlist.eyebrow ? ` · ${playlist.eyebrow}` : '')
</script>

<template>
  <section class="results">
    <template v-if="hasResult">
      <p class="summary">「{{ keyword }}」找到 {{ countLine }}</p>

      <div v-if="tracks.length" class="block">
        <SectionHeading title="单曲" size="sm" />
        <div class="rows">
          <SearchSongItem
            v-for="(track, index) in tracks"
            :key="track.id"
            :track="track"
            :highlight="keyword"
            @play="playFromList(tracks, index)"
            @pause="player.toggle()"
          />
        </div>
      </div>

      <div v-if="artists.length" class="block">
        <SectionHeading title="歌手" size="sm" />
        <div class="artists">
          <button
            v-for="artist in artists"
            :key="artist.name"
            class="artist"
            :title="`查看 ${artist.name}`"
            @click="openArtistPage(artist.name)"
          >
            <AppIcon name="user" :size="13" />
            <span class="artist-name">{{ artist.name }}</span>
            <span class="artist-count">{{ artist.count }} 首</span>
          </button>
        </div>
      </div>

      <div v-if="playlists.length" class="block">
        <SectionHeading title="歌单" size="sm" />
        <div class="rows">
          <button
            v-for="playlist in playlists"
            :key="playlist.id"
            class="playlist"
            @click="openPlaylistPage(playlist.id)"
          >
            <CoverArt :cover="playlist.cover" size="tiny" />
            <span class="playlist-copy">
              <strong>{{ playlist.title }}</strong>
              <small>{{ playlistMeta(playlist) }}</small>
            </span>
            <AppIcon name="chevron-right" :size="14" />
          </button>
        </div>
      </div>

      <button class="see-all" @click="openAllResults()">
        查看「{{ keyword }}」的全部结果
        <AppIcon name="arrow" :size="14" />
      </button>
    </template>

    <template v-else>
      <div class="nothing">
        <AppIcon name="search" :size="22" />
        <strong>没有找到「{{ keyword }}」</strong>
        <p>换一首歌名、歌手或专辑试试；也可能是它还没进入你的曲库。</p>
      </div>
      <HotSearchList />
    </template>
  </section>
</template>

<style scoped>
.summary {
  margin-bottom: 16px;
  color: var(--text-3);
  font-size: 12px;
}
.block {
  margin-bottom: 22px;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.artists {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.artist {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: var(--surface-soft);
  transition:
    background var(--dur-1) ease,
    color var(--dur-1) ease;
}
.artist:hover {
  color: var(--brand);
  background: var(--surface-soft-hover);
}
.artist-name {
  max-width: 160px;
  overflow: hidden;
  color: var(--text-1);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artist-count {
  color: var(--text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.playlist {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 14px;
  gap: 12px;
  align-items: center;
  padding: 6px 8px;
  border-radius: var(--r-md);
  color: var(--text-3);
  transition: background var(--dur-1) ease;
}
.playlist:hover {
  background: var(--surface-hover);
}
.playlist-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.playlist-copy strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playlist-copy small {
  overflow: hidden;
  color: var(--text-2);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.see-all {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 9px 16px;
  border-radius: var(--r-md);
  color: var(--brand);
  background: var(--brand-soft);
  font-size: 13px;
  transition:
    background var(--dur-1) ease,
    gap var(--dur-1) var(--ease);
}
.see-all:hover {
  gap: 9px;
  box-shadow: inset 0 0 0 1px var(--brand-ring);
}

.nothing {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  padding: 26px 0 30px;
  color: var(--text-3);
  text-align: center;
}
.nothing strong {
  margin-top: 8px;
  color: var(--text-1);
  font-size: 15px;
  font-weight: 500;
}
.nothing p {
  max-width: 380px;
  font-size: 12.5px;
  line-height: 1.6;
}
</style>

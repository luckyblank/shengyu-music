<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import SongRow from '../music/SongRow.vue'
import { playlistCover } from '../../composables/usePlaybackActions'
import {
  applyKeyword,
  matchedAlbums,
  matchedArtists,
  matchedPlaylists,
  matchedRadio,
  matchedTracks,
  normalizedQuery,
  openArtistPage,
  openPage,
  openPlaylistPage,
  openResultsWith,
  playFromList,
  recommendedTracks
} from '../../composables/useSearchDiscovery'
import { radioChannelToTrack, radioChannels, loadRadioChannels } from '../../stores/radio'
import { allTracks, playStats, playlists } from '../../stores/library'
import * as player from '../../stores/player'
import type { CoverSpec, Track } from '../../types/music'

/**
 * 搜索建议 —— 浮层右下角那一格，带 5 个分类 Tab。
 *
 * 两种状态共用一套 Tab：
 *  - 有输入时给该分类的实时命中（点一条直接进结果页对应分类）；
 *  - 没有输入时给「可以浏览的」同类内容 —— 榜单前列、常听歌手、曲库专辑、
 *    自建歌单、电台频道，这样这一格在任何时候都不是空的。
 *
 * 电台频道是懒加载的：只有真的切到电台 Tab 才去拉，否则为了一个可能没人点的
 * Tab 每次展开浮层都要发一次网络请求。
 */

type TabKey = 'track' | 'artist' | 'album' | 'playlist' | 'radio'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'track', label: '单曲' },
  { key: 'artist', label: '歌手' },
  { key: 'album', label: '专辑' },
  { key: 'playlist', label: '歌单' },
  { key: 'radio', label: '电台' }
]

const SUGGEST_LIMIT = 6

const tab = ref<TabKey>('track')

function selectTab(key: TabKey): void {
  tab.value = key
  if (key === 'radio') void loadRadioChannels()
}

/* 曲目：有查询用命中结果，没查询用推荐池 —— 都是真会想听的东西 */
const trackItems = computed<Track[]>(() => {
  if (normalizedQuery.value) return matchedTracks.value.slice(0, SUGGEST_LIMIT)
  return recommendedTracks.value.slice(0, SUGGEST_LIMIT)
})

interface LinkRow {
  key: string
  title: string
  subtitle: string
  cover?: CoverSpec
  badge?: string
}

/** 歌手：有查询按命中；没查询按真实播放次数排。 */
const artistRows = computed<LinkRow[]>(() => {
  if (normalizedQuery.value) {
    return matchedArtists.value.slice(0, SUGGEST_LIMIT).map((hit) => ({
      key: hit.name,
      title: hit.name,
      subtitle: `${hit.count} 首在曲库`,
      badge: hit.name.slice(0, 1)
    }))
  }
  return Object.entries(playStats.value.artists)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SUGGEST_LIMIT)
    .map(([name, count]) => ({
      key: name,
      title: name,
      subtitle: `播放 ${count} 次`,
      badge: name.slice(0, 1)
    }))
})

/** 专辑：有查询用命中的聚合结果；没查询列曲库里曲目最多的几张。 */
const albumRows = computed<LinkRow[]>(() => {
  if (normalizedQuery.value) {
    return matchedAlbums.value.slice(0, SUGGEST_LIMIT).map((album) => ({
      key: album.name,
      title: album.name,
      subtitle: album.artist,
      cover: album.cover
    }))
  }
  const groups = new Map<
    string,
    { name: string; artist: string; cover: CoverSpec; count: number }
  >()
  for (const track of allTracks.value) {
    if (!track.album) continue
    const key = albumKey(track)
    const exists = groups.get(key)
    if (exists) {
      exists.count++
      continue
    }
    groups.set(key, { name: track.album, artist: track.artist, cover: track.cover, count: 1 })
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name))
    .slice(0, SUGGEST_LIMIT)
    .map(([key, album]) => ({
      key,
      title: album.name,
      subtitle: `${album.artist} · ${album.count} 首`,
      cover: album.cover
    }))
})

const albumKey = (track: Track): string => `${track.album}|${track.artist}`.toLocaleLowerCase()

/** 歌单：有查询用命中的，没查询列全部自建歌单。 */
const playlistRows = computed<LinkRow[]>(() => {
  const source = normalizedQuery.value
    ? matchedPlaylists.value
    : playlists.value.slice(0, SUGGEST_LIMIT)
  return source.slice(0, SUGGEST_LIMIT).map((playlist) => ({
    key: playlist.id,
    title: playlist.title,
    subtitle: `${playlist.trackIds.length} 首`,
    cover: playlistCover(playlist)
  }))
})

/** 电台：同理，命中不到就列全部频道。 */
const radioRows = computed<LinkRow[]>(() => {
  const source = normalizedQuery.value ? matchedRadio.value : radioChannels.value
  return source.slice(0, SUGGEST_LIMIT).map((channel) => ({
    key: channel.id,
    title: channel.title,
    subtitle: channel.genre || channel.description
  }))
})

const emptyHint = computed(() => {
  if (tab.value === 'radio') return '正在拉取电台频道…'
  return normalizedQuery.value ? '这个分类没有匹配内容' : '还什么都没有，先导入一些音乐吧'
})

function openRow(row: LinkRow): void {
  switch (tab.value) {
    case 'artist':
      openArtistPage(row.title)
      return
    case 'album':
      openResultsWith(row.title, 'album')
      return
    case 'playlist':
      openPlaylistPage(row.key)
      return
    case 'radio': {
      const channel = radioChannels.value.find((item) => item.id === row.key)
      if (channel) void player.playTracks([radioChannelToTrack(channel)], 'radio', 0)
      openPage('radio')
      return
    }
    default:
      applyKeyword(row.title)
  }
}

/** 点单曲 Tab 里的行时整列入队，与结果页、榜单一致 */
const playTrackAt = (index: number): void => playFromList(trackItems.value, index)

/** 空查询时的歌手榜可能整列为空，界面据此收起这一个 Tab 的内容 */
const currentRows = computed<LinkRow[]>(() => {
  switch (tab.value) {
    case 'artist':
      return artistRows.value
    case 'album':
      return albumRows.value
    case 'playlist':
      return playlistRows.value
    case 'radio':
      return radioRows.value
    default:
      return []
  }
})
</script>

<template>
  <section class="suggest">
    <div class="suggest-head">
      <h3>搜索建议</h3>
      <div class="tabs" role="tablist">
        <button
          v-for="item in TABS"
          :key="item.key"
          class="tab"
          :class="{ active: tab === item.key }"
          role="tab"
          :aria-selected="tab === item.key"
          @click="selectTab(item.key)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <!-- 单曲：直接用统一的曲目行，只是把行高压到 44px 以适配浮层这一格 -->
    <div v-if="tab === 'track'" class="track-list">
      <SongRow
        v-for="(track, index) in trackItems"
        :key="track.id"
        :track="track"
        :index="index + 1"
        @play="playTrackAt(index)"
      />
      <p v-if="!trackItems.length" class="hint">还没有可推荐的单曲，先导入一些音乐吧</p>
    </div>

    <!-- 其余分类：封面/首字母 + 标题 + 副标，点到对应的页面或结果分类 -->
    <div v-else-if="currentRows.length" class="link-list">
      <button v-for="row in currentRows" :key="row.key" class="link-row" @click="openRow(row)">
        <CoverArt v-if="row.cover" :cover="row.cover" size="tiny" />
        <span v-else class="face">{{ row.badge }}</span>
        <span class="copy">
          <strong :title="row.title">{{ row.title }}</strong>
          <small :title="row.subtitle">{{ row.subtitle }}</small>
        </span>
        <AppIcon name="arrow" :size="13" />
      </button>
    </div>

    <p v-else class="hint">{{ emptyHint }}</p>
  </section>
</template>

<style scoped>
.suggest {
  min-width: 0;
}

.suggest-head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.suggest-head h3 {
  color: var(--text-1);
  font-size: 17px;
  font-weight: 600;
}

.tabs {
  display: flex;
  gap: 2px;
}
.tab {
  padding: 3px 10px;
  border-radius: var(--r-pill);
  color: var(--text-3);
  background: transparent;
  font-size: 12px;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.tab:hover {
  color: var(--text-1);
}
/* 选中档用品牌浅底，与浮层里其它选中态一致 */
.tab.active {
  color: var(--brand);
  background: var(--brand-soft);
}

.track-list {
  display: flex;
  flex-direction: column;
}
/* 浮层这一格只有 ~200px 高：不压行高就只能显示两首，压到 44px 能显示五首 */
.track-list :deep(.song-row) {
  min-height: 44px;
  gap: 10px;
}

.link-list {
  display: flex;
  flex-direction: column;
}
.link-row {
  display: flex;
  gap: 10px;
  align-items: center;
  height: 44px;
  padding: 0 8px;
  border-radius: var(--r-sm);
  color: var(--text-3);
  background: transparent;
  text-align: left;
  transition: background var(--dur-1) ease;
}
.link-row:hover {
  background: var(--surface-hover);
}
.link-row:hover > .copy strong {
  color: var(--brand);
}
.face {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  color: var(--on-brand);
  background: var(--brand);
  font-size: 15px;
}
.copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
}
.copy strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--dur-1) ease;
}
.copy small {
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint {
  padding: 20px 0;
  color: var(--text-3);
  font-size: 13px;
  text-align: center;
}
</style>

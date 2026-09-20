<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RadioChannel } from '@shared/ipc'
import AppIcon from '../AppIcon.vue'
import MediaCard from '../music/MediaCard.vue'
import SongRow from '../music/SongRow.vue'
import TrackMenu, { type TrackMenuState } from '../TrackMenu.vue'
import BestMatch from '../search/BestMatch.vue'
import GuessYouSearch from '../search/GuessYouSearch.vue'
import HotBoard from '../search/HotBoard.vue'
import HotLyricsCard from '../search/HotLyricsCard.vue'
import LikeRecommend from '../search/LikeRecommend.vue'
import LyricHits from '../search/LyricHits.vue'
import RecentSearch from '../search/RecentSearch.vue'
import RelatedSearches from '../search/RelatedSearches.vue'
import RisingList from '../search/RisingList.vue'
import SearchBanner from '../search/SearchBanner.vue'
import SearchTrackTable from '../search/SearchTrackTable.vue'
import SuggestList from '../search/SuggestList.vue'
import { playPlaylist, playlistCover } from '../../composables/usePlaybackActions'
import {
  ensureLyricsIndex,
  lyricHitCount,
  lyricIndexRequested
} from '../../composables/useLyricsSearch'
import {
  filterCount,
  hasResult,
  likedOnly,
  matchedAlbums,
  matchedArtists,
  matchedPlaylists,
  matchedRadio,
  normalizedQuery,
  openArtistPage,
  openPlaylistPage,
  originFilter,
  playFromList,
  resetSearchFilters,
  resultTracks,
  SEARCH_SORTS,
  SEARCH_TABS,
  type SearchSort,
  searchSort,
  searchTab,
  setSearchTab,
  toggleLikedOnly,
  toggleOriginFilter
} from '../../composables/useSearchDiscovery'
import { photoCover } from '../../data/catalog'
import * as online from '../../stores/online'
import * as player from '../../stores/player'
import * as radio from '../../stores/radio'
import * as ui from '../../stores/ui'
import type { Track, TrackOrigin } from '../../types/music'

/**
 * 搜索结果页 —— 搜索浮层的「更深一层」。
 *
 * 与 SearchOverlay 共用 useSearchDiscovery / useLyricsSearch 的派生数据，所以页面上
 * 看到的结果与浮层里逐字输入时看到的是同一份。差别只在呈现：浮层是速览（每类前几条
 * + 查看全部），页面是分类齐全的完整结果加右栏。
 */

/** 「综合」分类里单曲只列前几首，更多点进「单曲」分类看完整表格 */
const ALL_TRACK_LIMIT = 10
/** 综合页的专辑/歌单网格也各只列前几张 */
const ALL_GRID_LIMIT = 6

const ORIGINS: { key: TrackOrigin; label: string }[] = [
  { key: 'local', label: '本地' },
  { key: 'remote', label: '在线' },
  { key: 'demo', label: '演示' },
  { key: 'radio', label: '电台' }
]

const menu = ref<TrackMenuState | null>(null)

function openMenu(track: Track, event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menu.value = { track, x: rect.left, y: rect.bottom + 4 }
}

/* ------------------------------- 排序与筛选 ------------------------------- */

const sortOpen = ref(false)
const filterOpen = ref(false)

const sortLabel = computed(
  () => SEARCH_SORTS.find((item) => item.key === searchSort.value)?.label ?? '最相关'
)

/** 内联多语句模板表达式会被 Vue 编译器包进括号里而报错，所以收成一个方法 */
function pickSort(key: SearchSort): void {
  searchSort.value = key
  sortOpen.value = false
}

/** 点空白处收起弹层 —— 弹层不自己关的话，点页面别处它还会浮在上面 */
function onGlobalDown(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest('.popover-wrap')) return
  sortOpen.value = false
  filterOpen.value = false
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  sortOpen.value = false
  filterOpen.value = false
}

/* -------------------------------- 分类计数 ------------------------------- */

const tabCounts = computed<Record<string, number>>(() => ({
  track: resultTracks.value.length,
  artist: matchedArtists.value.length,
  album: matchedAlbums.value.length,
  playlist: matchedPlaylists.value.length,
  // 歌词索引还没建完时不给数字：0 会被读成「没搜到」，实际只是还没读完
  lyric: lyricIndexRequested.value ? lyricHitCount(normalizedQuery.value) : 0,
  radio: normalizedQuery.value ? matchedRadio.value.length : radio.radioChannels.value.length
}))

/* --------------------------------- 电台 --------------------------------- */

const radioList = computed<RadioChannel[]>(() =>
  normalizedQuery.value ? matchedRadio.value : radio.radioChannels.value
)

function playRadio(index: number): void {
  void player.playTracks(radioList.value.map(radio.radioChannelToTrack), 'radio', index)
}

/* --------------------------------- 布局 --------------------------------- */

/** 右栏只在读文字的列里出现；专辑/歌手本身是网格，要的是宽度 */
const showRail = computed(() => searchTab.value !== 'album' && searchTab.value !== 'artist')

const allTracks = computed(() => resultTracks.value.slice(0, ALL_TRACK_LIMIT))
const allAlbums = computed(() => matchedAlbums.value.slice(0, ALL_GRID_LIMIT))
const allPlaylists = computed(() => matchedPlaylists.value.slice(0, ALL_GRID_LIMIT))

const summary = computed(() =>
  [
    `单曲 ${tabCounts.value.track}`,
    `歌手 ${tabCounts.value.artist}`,
    `专辑 ${tabCounts.value.album}`,
    `歌单 ${tabCounts.value.playlist}`
  ].join(' · ')
)

watch(
  [normalizedQuery, searchTab],
  ([query, tab]) => {
    if (!query) return
    // 歌词索引是惰性建的（见 useLyricsSearch）：只有这一页真的要显示歌词才去读盘，
    // 建好之后这次调用是空操作。综合页也建，因为右栏挂着「热门歌词」卡。
    if (tab === 'lyric' || tab === 'all') void ensureLyricsIndex()
    if (tab === 'radio') void radio.loadRadioChannels()
  },
  { immediate: true }
)

onMounted(() => {
  document.addEventListener('mousedown', onGlobalDown)
  document.addEventListener('keydown', onGlobalKeydown)
  // 空查询时的发现布局要用榜单；浮层已拉过一次的话这里命中的是缓存
  void online.loadChart()
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onGlobalDown)
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <section class="page-view">
    <template v-if="normalizedQuery">
      <header class="page-head">
        <div class="head-copy">
          <h1>搜索结果</h1>
          <p>
            为「<em>{{ ui.searchQuery.value.trim() }}</em
            >」找到相关内容
            <span class="dim">· {{ summary }}</span>
          </p>
        </div>

        <div class="head-tools">
          <div class="popover-wrap">
            <button class="tool-btn" @click="sortOpen = !sortOpen">
              <AppIcon name="trend" :size="14" />
              {{ sortLabel }}
              <AppIcon name="chevron-down" :size="13" />
            </button>
            <div v-if="sortOpen" class="popover">
              <button
                v-for="item in SEARCH_SORTS"
                :key="item.key"
                class="popover-row"
                :class="{ active: searchSort === item.key }"
                @click="pickSort(item.key)"
              >
                {{ item.label }}
                <AppIcon v-if="searchSort === item.key" name="check" :size="13" />
              </button>
            </div>
          </div>

          <div class="popover-wrap">
            <button
              class="tool-btn"
              :class="{ active: filterCount > 0 }"
              @click="filterOpen = !filterOpen"
            >
              <AppIcon name="filter" :size="14" />
              筛选<span v-if="filterCount"> · {{ filterCount }}</span>
            </button>
            <div v-if="filterOpen" class="popover wide">
              <p class="popover-label">来源</p>
              <div class="chips">
                <button
                  v-for="item in ORIGINS"
                  :key="item.key"
                  class="chip"
                  :class="{ active: originFilter.includes(item.key) }"
                  @click="toggleOriginFilter(item.key)"
                >
                  {{ item.label }}
                </button>
              </div>
              <p class="popover-label">其他</p>
              <button class="popover-row" :class="{ active: likedOnly }" @click="toggleLikedOnly()">
                只看已收藏
                <AppIcon v-if="likedOnly" name="check" :size="13" />
              </button>
              <button class="reset" :disabled="filterCount === 0" @click="resetSearchFilters()">
                重置筛选
              </button>
            </div>
          </div>

          <button class="tool-btn" @click="ui.searchQuery.value = ''">
            <AppIcon name="close" :size="14" />
            清空
          </button>
        </div>
      </header>

      <!-- 分类行：切分类是用户显式动作，换关键词不会把 Tab 重置回「综合」 -->
      <nav class="tabs">
        <button
          v-for="item in SEARCH_TABS"
          :key="item.key"
          class="tab"
          :class="{ active: searchTab === item.key }"
          @click="setSearchTab(item.key)"
        >
          {{ item.label }}
          <span v-if="tabCounts[item.key]" class="tab-count">{{ tabCounts[item.key] }}</span>
        </button>
      </nav>

      <div class="layout" :class="{ 'no-rail': !showRail }">
        <div class="main-col">
          <template v-if="searchTab === 'all'">
            <template v-if="hasResult">
              <BestMatch />

              <section v-if="allTracks.length" class="block">
                <div class="block-head">
                  <h2>单曲</h2>
                  <button
                    v-if="resultTracks.length > allTracks.length"
                    class="more"
                    @click="setSearchTab('track')"
                  >
                    查看全部 {{ resultTracks.length }} 首
                    <AppIcon name="arrow" :size="13" />
                  </button>
                </div>
                <div class="rows">
                  <SongRow
                    v-for="(track, index) in allTracks"
                    :key="track.id"
                    :track="track"
                    :index="index + 1"
                    show-album
                    @play="playFromList(allTracks, index)"
                    @menu="openMenu"
                  />
                </div>
              </section>

              <section v-if="allAlbums.length" class="block">
                <h2>专辑</h2>
                <div class="grid">
                  <MediaCard
                    v-for="album in allAlbums"
                    :key="album.name"
                    :cover="album.cover"
                    :title="album.name"
                    :badge="`${album.tracks.length} 首`"
                    :subtitle="album.artist"
                    @play="playFromList(album.tracks, 0)"
                    @open="openArtistPage(album.artist)"
                  />
                </div>
              </section>

              <section v-if="matchedArtists.length" class="block">
                <h2>歌手</h2>
                <div class="artists">
                  <button
                    v-for="hit in matchedArtists"
                    :key="hit.name"
                    class="artist-chip"
                    @click="openArtistPage(hit.name)"
                  >
                    <span class="artist-face">{{ hit.name.slice(0, 1) }}</span>
                    <span class="artist-copy">
                      <strong>{{ hit.name }}</strong>
                      <small>{{ hit.count }} 首</small>
                    </span>
                  </button>
                </div>
              </section>

              <section v-if="allPlaylists.length" class="block">
                <h2>歌单</h2>
                <div class="grid">
                  <MediaCard
                    v-for="playlist in allPlaylists"
                    :key="playlist.id"
                    :cover="playlistCover(playlist)"
                    :title="playlist.title"
                    :badge="`${playlist.trackIds.length} 首`"
                    :description="playlist.description"
                    @play="playPlaylist(playlist)"
                    @open="openPlaylistPage(playlist.id)"
                  />
                </div>
              </section>
            </template>

            <p v-else class="state">没有找到匹配内容。换个关键词，或从右栏的相关搜索里挑一个。</p>
          </template>

          <template v-else-if="searchTab === 'track'">
            <SearchTrackTable
              :tracks="resultTracks"
              :note="filterCount ? `已按筛选条件过滤，共 ${resultTracks.length} 首` : ''"
              @menu="openMenu"
            />
          </template>

          <template v-else-if="searchTab === 'artist'">
            <div v-if="matchedArtists.length" class="artists wide">
              <button
                v-for="hit in matchedArtists"
                :key="hit.name"
                class="artist-chip"
                @click="openArtistPage(hit.name)"
              >
                <span class="artist-face">{{ hit.name.slice(0, 1) }}</span>
                <span class="artist-copy">
                  <strong>{{ hit.name }}</strong>
                  <small>{{ hit.count }} 首</small>
                </span>
              </button>
            </div>
            <p v-else class="state">没有匹配的歌手。歌手是从曲库里按艺人名聚合出来的。</p>
          </template>

          <template v-else-if="searchTab === 'album'">
            <div v-if="matchedAlbums.length" class="grid wide">
              <MediaCard
                v-for="album in matchedAlbums"
                :key="album.name"
                :cover="album.cover"
                :title="album.name"
                :badge="`${album.tracks.length} 首`"
                :subtitle="album.artist"
                @play="playFromList(album.tracks, 0)"
                @open="openArtistPage(album.artist)"
              />
            </div>
            <p v-else class="state">没有匹配的专辑。专辑是按命中曲目的专辑名聚合出来的。</p>
          </template>

          <template v-else-if="searchTab === 'playlist'">
            <div v-if="matchedPlaylists.length" class="grid">
              <MediaCard
                v-for="playlist in matchedPlaylists"
                :key="playlist.id"
                :cover="playlistCover(playlist)"
                :title="playlist.title"
                :badge="`${playlist.trackIds.length} 首`"
                :description="playlist.description"
                @play="playPlaylist(playlist)"
                @open="openPlaylistPage(playlist.id)"
              />
            </div>
            <p v-else class="state">没有匹配的歌单。歌单是自建的，标题或简介里带关键词才会命中。</p>
          </template>

          <template v-else-if="searchTab === 'lyric'">
            <LyricHits />
          </template>

          <template v-else>
            <div v-if="radioList.length" class="grid wide">
              <MediaCard
                v-for="(channel, index) in radioList"
                :key="channel.id"
                :cover="
                  channel.coverUrl ? { kind: 'url', url: channel.coverUrl } : photoCover('night')
                "
                :title="channel.title"
                :badge="channel.genre"
                :description="channel.description"
                @play="playRadio(index)"
                @open="playRadio(index)"
              />
            </div>
            <p v-else class="state">
              {{ radio.radioLoading.value ? '正在拉取电台频道…' : '没有匹配的电台频道。' }}
            </p>
          </template>
        </div>

        <aside v-if="showRail" class="rail">
          <RelatedSearches />
          <LikeRecommend />
          <HotLyricsCard @more="setSearchTab('lyric')" />
        </aside>
      </div>
    </template>

    <!-- 空查询：与浮层同一套发现布局，误点进搜索页时也总有东西可看 -->
    <template v-else>
      <header class="page-head">
        <div class="head-copy">
          <h1>搜索</h1>
          <p>在顶栏输入歌曲、歌手或专辑名；不知道听什么，就从下面挑一个。</p>
        </div>
      </header>

      <GuessYouSearch />
      <div class="discover-grid">
        <HotBoard />
        <RisingList />
      </div>
      <div class="discover-grid">
        <RecentSearch />
        <SuggestList />
      </div>
      <SearchBanner />
    </template>

    <TrackMenu v-if="menu" :state="menu" @close="menu = null" />
  </section>
</template>

<style scoped>
.page-head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 20px;
}
.head-copy h1 {
  color: var(--text-1);
  font-size: 34px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.head-copy p {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 14px;
}
.head-copy em {
  color: var(--brand);
  font-style: normal;
}
.head-copy .dim {
  color: var(--text-3);
}

.head-tools {
  display: flex;
  gap: 8px;
  align-items: center;
}
.tool-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--divider);
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: transparent;
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    border-color var(--dur-1) ease;
}
.tool-btn:hover {
  color: var(--text-1);
  border-color: var(--text-3);
}
.tool-btn.active {
  color: var(--brand);
  border-color: var(--brand);
}

.popover-wrap {
  position: relative;
}
.popover {
  position: absolute;
  z-index: 12;
  top: calc(100% + 6px);
  right: 0;
  width: 168px;
  padding: 6px;
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
}
.popover.wide {
  width: 232px;
}
.popover-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--r-sm);
  color: var(--text-2);
  background: transparent;
  font-size: 13px;
  text-align: left;
}
.popover-row:hover {
  color: var(--text-1);
  background: var(--surface-hover);
}
.popover-row.active {
  color: var(--brand);
}
.popover-label {
  padding: 8px 8px 6px;
  color: var(--text-3);
  font-size: 12px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 8px 6px;
}
.chip {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: var(--surface-soft);
  font-size: 12px;
}
.chip:hover {
  background: var(--surface-soft-hover);
}
.chip.active {
  color: var(--brand);
  background: var(--brand-soft);
}
.reset {
  width: 100%;
  margin-top: 6px;
  padding: 7px 0;
  border-top: 1px solid var(--divider);
  color: var(--text-3);
  background: transparent;
  font-size: 12px;
}
.reset:hover:not(:disabled) {
  color: var(--brand);
}
.reset:disabled {
  opacity: 0.45;
}

.tabs {
  display: flex;
  gap: 22px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--divider);
}
.tab {
  position: relative;
  padding: 0 2px 12px;
  color: var(--text-2);
  background: transparent;
  font-size: 15px;
  transition: color var(--dur-1) ease;
}
.tab:hover {
  color: var(--text-1);
}
.tab.active {
  color: var(--brand);
  font-weight: 600;
}
/* 选中态是一条压在下划线上的横杠，而不是整块底色 —— 分类行不该抢结果的视觉 */
.tab.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--brand);
  content: '';
}
.tab-count {
  margin-left: 4px;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 400;
}
.tab.active .tab-count {
  color: var(--brand);
}

.layout {
  display: grid;
  align-items: start;
  gap: 32px;
  grid-template-columns: minmax(0, 1fr) 280px;
}
.layout.no-rail {
  grid-template-columns: minmax(0, 1fr);
}

.main-col {
  min-width: 0;
}
.block + .block {
  margin-top: 30px;
}
.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.main-col h2 {
  margin-bottom: 12px;
  color: var(--text-1);
  font-size: 18px;
  font-weight: 600;
}
.more {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: var(--text-3);
  background: transparent;
  font-size: 13px;
}
.more:hover {
  color: var(--brand);
}

.rows {
  display: flex;
  flex-direction: column;
}

.grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
}
.grid.wide {
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
}

.artists {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
.artists.wide {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}
.artist-chip {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-radius: var(--r-md);
  background: var(--surface-soft);
  text-align: left;
  transition: background var(--dur-1) ease;
}
.artist-chip:hover {
  background: var(--surface-hover);
}
.artist-face {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  color: var(--on-brand);
  background: var(--brand);
  font-size: 16px;
}
.artist-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.artist-copy strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artist-copy small {
  color: var(--text-3);
  font-size: 12px;
}

.rail {
  display: flex;
  position: sticky;
  top: 0;
  min-width: 0;
  flex-direction: column;
  gap: 26px;
}

.state {
  padding: 70px 20px;
  color: var(--text-3);
  font-size: 15px;
  line-height: 1.7;
  text-align: center;
}

/* 空查询时套用浮层同款两列发现布局 */
.discover-grid {
  display: grid;
  gap: 0 22px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  margin-top: 26px;
}
.discover-grid > * + * {
  padding-left: 22px;
  border-left: 1px solid var(--divider);
}
</style>

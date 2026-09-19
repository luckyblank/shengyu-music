<script setup lang="ts">
import { computed, onMounted } from 'vue'
import MediaCard from '../music/MediaCard.vue'
import SectionHeading from '../music/SectionHeading.vue'
import SongRow from '../music/SongRow.vue'
import EmotionTags from '../search/EmotionTags.vue'
import HotSearchList from '../search/HotSearchList.vue'
import RecentListen from '../search/RecentListen.vue'
import RecentSearch from '../search/RecentSearch.vue'
import RecommendSongs from '../search/RecommendSongs.vue'
import { playPlaylist, playlistCover } from '../../composables/usePlaybackActions'
import {
  hasResult,
  matchedArtists,
  matchedPlaylists,
  matchedTracks,
  normalizedQuery,
  openArtistPage
} from '../../composables/useSearchDiscovery'
import * as online from '../../stores/online'
import * as player from '../../stores/player'
import * as ui from '../../stores/ui'

/**
 * 搜索页 —— 浮层的「更深一层」。
 *
 * 与 SearchOverlay 共用 useSearchDiscovery 的派生数据，因此页面上看到的结果
 * 与浮层里逐字输入时看到的完全一致。差别只在呈现方式：
 * 浮层是速览（每类前几条 + 查看全部），页面是完整的单曲 / 歌单 / 歌手列表；
 * 没有查询时铺开与浮层同一套发现模块，点进来也总有东西可看。
 */

const summary = computed(
  () =>
    `单曲 ${matchedTracks.value.length} · 歌单 ${matchedPlaylists.value.length} · 歌手 ${matchedArtists.value.length}`
)

onMounted(() => {
  // 空态的热门搜索要用榜单；浮层已拉过一次时这里命中缓存
  void online.loadChart()
})
</script>

<template>
  <section class="page-view">
    <header class="page-head">
      <div>
        <h1 v-if="normalizedQuery">“{{ ui.searchQuery.value.trim() }}” 的结果</h1>
        <h1 v-else>搜索你的下一首歌</h1>
        <p v-if="normalizedQuery">{{ summary }}</p>
        <p v-else>在顶栏输入歌曲、歌手或专辑名；不知道听什么，就从下面挑一个。</p>
      </div>
      <div v-if="normalizedQuery" class="page-actions">
        <button class="text-btn" @click="ui.searchQuery.value = ''">清空关键词</button>
      </div>
    </header>

    <!-- 有查询：完整结果 -->
    <template v-if="normalizedQuery">
      <template v-if="hasResult">
        <section v-if="matchedTracks.length">
          <SectionHeading title="单曲" :note="`${matchedTracks.length} 首`" />
          <div class="rows">
            <SongRow
              v-for="(track, index) in matchedTracks"
              :key="track.id"
              :track="track"
              :index="index + 1"
              show-album
              show-origin
              @play="player.playTrack(track)"
            />
          </div>
        </section>

        <section v-if="matchedPlaylists.length">
          <SectionHeading title="歌单" :note="`${matchedPlaylists.length} 个`" />
          <div class="grid">
            <MediaCard
              v-for="playlist in matchedPlaylists"
              :key="playlist.id"
              :cover="playlistCover(playlist)"
              :title="playlist.title"
              :badge="`${playlist.trackIds.length} 首`"
              :description="playlist.description"
              @play="playPlaylist(playlist)"
              @open="ui.openPlaylist(playlist.id)"
            />
          </div>
        </section>

        <section v-if="matchedArtists.length">
          <SectionHeading title="歌手" :note="`${matchedArtists.length} 位`" />
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
      </template>

      <p v-else class="state">没有找到匹配内容，换个关键词试试。</p>
    </template>

    <!-- 空查询：与浮层同一套发现流，不再是一堆排行榜 -->
    <template v-else>
      <RecentSearch />
      <EmotionTags />
      <HotSearchList />
      <RecommendSongs />
      <RecentListen />
    </template>
  </section>
</template>

<style scoped>
.page-head {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 26px;
}
.page-head h1 {
  color: var(--text-1);
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.page-head p {
  margin-top: 6px;
  max-width: 640px;
  color: var(--text-2);
  font-size: 15px;
}
.page-actions {
  display: flex;
  gap: 10px;
}

/* 相邻外边距会合并：发现流里模块自带的 22px 与这里的 36px 取大值，不会叠加 */
section + section {
  margin-top: 36px;
}
.rows {
  display: flex;
  flex-direction: column;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: 18px;
}

.artists {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
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

.text-btn {
  color: var(--text-2);
  background: transparent;
  font-size: 13px;
}
.text-btn:hover {
  color: var(--brand);
}

.state {
  padding: 70px 0;
  color: var(--text-3);
  font-size: 15px;
  text-align: center;
}
</style>

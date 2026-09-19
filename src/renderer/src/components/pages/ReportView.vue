<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import MediaCard from '../music/MediaCard.vue'
import SectionHeading from '../music/SectionHeading.vue'
import SongList from '../music/SongList.vue'
import { playPlaylist, playlistCover } from '../../composables/usePlaybackActions'
import {
  likedTracks,
  playStats,
  playlists,
  recent,
  recentTracks,
  trackById
} from '../../stores/library'
import * as ui from '../../stores/ui'
import type { Track } from '../../types/music'

/**
 * 听歌报告 / 音乐画像。
 *
 * 每一条结论都由 playStats 的真实计数推导，**没有一条是编的**：
 * 时段来自播放时刻的 24 桶直方图，流派与音乐人来自曲目自身的标签。
 * 数据不足以支撑结论时给「样本还不够」，不硬凑。
 */

const totalPlays = computed(() => recent.value.reduce((sum, item) => sum + item.count, 0))

const totalMinutes = computed(() =>
  recent.value.reduce(
    (sum, item) => sum + item.count * ((trackById(item.id)?.duration ?? 0) / 60),
    0
  )
)

/** 24 小时直方图，用于画时段分布 */
const hourBuckets = computed(() => playStats.value.hours)
const hourPeak = computed(() => Math.max(...hourBuckets.value, 1))
const hasHourData = computed(() => hourBuckets.value.some((value) => value > 0))

/** 深夜时段占比：22:00–02:00。确实有数据才算。 */
const nightRatio = computed(() => {
  const hours = hourBuckets.value
  const total = hours.reduce((sum, value) => sum + value, 0)
  if (!total) return 0
  const night = hours[22] + hours[23] + hours[0] + hours[1] + hours[2]
  return night / total
})

const topGenres = computed(() =>
  Object.entries(playStats.value.genres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
)

const topArtists = computed(() =>
  Object.entries(playStats.value.artists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
)

const genreTotal = computed(() => topGenres.value.reduce((sum, [, count]) => sum + count, 0))

/** 画像结论：只在样本足够时给，否则如实说明 */
const profile = computed(() => {
  const lines: string[] = []
  if (nightRatio.value >= 0.35) lines.push('你常在深夜听歌')
  else if (
    hourBuckets.value[8] + hourBuckets.value[9] + hourBuckets.value[10] >
    totalPlays.value * 0.3
  ) {
    lines.push('你的聆听集中在上午')
  }
  if (topGenres.value.length) lines.push(`偏好${topGenres.value[0][0]}`)
  if (topArtists.value.length) lines.push(`最常听 ${topArtists.value[0][0]}`)
  return lines
})

const trackCountOf = (id: string): number => recent.value.find((item) => item.id === id)?.count ?? 0

const topTracks = computed<Track[]>(() =>
  [...recent.value]
    .sort((a, b) => b.count - a.count)
    .map((item) => trackById(item.id))
    .filter((track): track is Track => Boolean(track))
    .slice(0, 8)
)

const recentLiked = computed(() => likedTracks.value.slice(0, 6))
</script>

<template>
  <section class="page-view">
    <header class="page-head">
      <div>
        <h1>听歌报告</h1>
        <p>每一条结论都来自真实播放记录，样本不足时不作结论。</p>
      </div>
    </header>

    <!-- 画像结论 -->
    <section class="profile-card">
      <span class="kicker">你的音乐画像</span>
      <div v-if="profile.length" class="profile-lines">
        <span v-for="line in profile" :key="line" class="profile-line">{{ line }}</span>
      </div>
      <p v-else class="profile-empty">
        样本还不够 —— 多听几首，这里会根据你的播放时段、流派与音乐人给出结论。
      </p>
    </section>

    <!-- 关键数字 -->
    <div class="stats">
      <div class="stat">
        <strong>{{ totalPlays }}</strong
        ><span>累计播放次数</span>
      </div>
      <div class="stat">
        <strong>{{ Math.round(totalMinutes) }}</strong
        ><span>累计聆听分钟</span>
      </div>
      <div class="stat">
        <strong>{{ recentTracks.length }}</strong
        ><span>听过的曲目</span>
      </div>
      <div class="stat">
        <strong>{{ topArtists.length ? topArtists[0][0] : '—' }}</strong
        ><span>最常听的歌手</span>
      </div>
    </div>

    <!-- 时段分布 -->
    <section class="block">
      <SectionHeading title="聆听时段" note="按每天 24 小时统计" />
      <div v-if="hasHourData" class="hours">
        <div
          v-for="(value, hour) in hourBuckets"
          :key="hour"
          class="hour"
          :title="`${hour} 点：${value} 次`"
        >
          <span class="hour-bar" :style="{ height: `${(value / hourPeak) * 100}%` }"></span>
          <small v-if="hour % 6 === 0">{{ hour }}</small>
        </div>
      </div>
      <p v-else class="hint">还没有足够的播放记录。</p>
      <p v-if="hasHourData" class="hint">
        深夜（22:00–02:00）占 {{ Math.round(nightRatio * 100) }}%
      </p>
    </section>

    <!-- 流派 -->
    <section v-if="topGenres.length" class="block">
      <SectionHeading title="常听的风格" note="来自曲目自带的流派标签" />
      <ul class="bars">
        <li v-for="[genre, count] in topGenres" :key="genre">
          <span class="bar-label">{{ genre }}</span>
          <span class="bar-track">
            <span class="bar-fill" :style="{ width: `${(count / genreTotal) * 100}%` }"></span>
          </span>
          <span class="bar-value">{{ count }} 次</span>
        </li>
      </ul>
    </section>

    <!-- 歌手 -->
    <section v-if="topArtists.length" class="block">
      <SectionHeading title="常听的歌手" />
      <div class="artists">
        <button
          v-for="[name, count] in topArtists"
          :key="name"
          class="artist-chip"
          @click="(ui.artistPage.value = name), ui.navigate('artist')"
        >
          <span class="artist-face">{{ name.slice(0, 1) }}</span>
          <span class="artist-copy">
            <strong>{{ name }}</strong>
            <small>{{ count }} 次播放</small>
          </span>
        </button>
      </div>
    </section>

    <!-- 最常听 -->
    <section v-if="topTracks.length" class="block">
      <SectionHeading title="最常听的歌曲" />
      <SongList :tracks="topTracks" show-album />
      <p class="hint">
        播放次数最高：{{ topTracks[0].title }}（{{ trackCountOf(topTracks[0].id) }} 次）
      </p>
    </section>

    <!-- 收藏与歌单 -->
    <section v-if="recentLiked.length" class="block">
      <SectionHeading
        title="最近喜欢"
        :note="`共 ${likedTracks.length} 首`"
        action="查看全部"
        @action="ui.navigate('favorites')"
      />
      <div class="grid">
        <MediaCard
          v-for="track in recentLiked"
          :key="track.id"
          :cover="track.cover"
          :title="track.title"
          :description="track.artist"
          @play="ui.navigate('favorites')"
          @open="ui.navigate('favorites')"
        />
      </div>
    </section>

    <section v-if="playlists.length" class="block">
      <SectionHeading title="我的歌单" :note="`共 ${playlists.length} 个`" />
      <div class="grid">
        <MediaCard
          v-for="playlist in playlists"
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

    <p class="footnote">
      <AppIcon name="spark" :size="13" /> 统计口径：播放次数按曲目计，时长为曲目时长 × 播放次数。
    </p>
  </section>
</template>

<style scoped>
.page-head {
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
  color: var(--text-2);
  font-size: 15px;
}

.profile-card {
  padding: 22px 24px;
  border-radius: var(--r-lg);
  background: var(--surface-soft);
}
.kicker {
  color: var(--brand);
  font-size: 13px;
  font-weight: 600;
}
.profile-lines {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}
.profile-line {
  padding: 6px 14px;
  border-radius: var(--r-pill);
  color: var(--text-1);
  background: var(--surface);
  font-size: 15px;
}
.profile-empty {
  margin-top: 10px;
  color: var(--text-2);
  font-size: 14px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 20px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}
.stat strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 26px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stat span {
  color: var(--text-3);
  font-size: 13px;
}

.block {
  margin-top: 40px;
}

/* 时段直方图：没有数据源就不画，不造假波形 */
.hours {
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 120px;
}
.hour {
  position: relative;
  display: flex;
  flex: 1 1 0;
  align-items: flex-end;
  height: 100%;
}
.hour-bar {
  width: 100%;
  min-height: 2px;
  border-radius: var(--r-xs);
  background: var(--brand);
  opacity: 0.75;
}
.hour small {
  position: absolute;
  bottom: -18px;
  left: 0;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
}
.bars li {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 70px;
  gap: 12px;
  align-items: center;
}
.bar-label {
  overflow: hidden;
  color: var(--text-1);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-track {
  height: 8px;
  border-radius: var(--r-xs);
  background: var(--surface-soft);
}
.bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--r-xs);
  background: var(--brand);
}
.bar-value {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: right;
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

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: 18px;
}

.hint {
  margin-top: 12px;
  color: var(--text-3);
  font-size: 13px;
}
.footnote {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 40px;
  padding-top: 18px;
  border-top: 1px solid var(--divider);
  color: var(--text-3);
  font-size: 12px;
}
</style>

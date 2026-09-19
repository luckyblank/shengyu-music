<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MediaCard from '../music/MediaCard.vue'
import SectionHeading from '../music/SectionHeading.vue'
import SongRow from '../music/SongRow.vue'
import { playAll, playPlaylist, playlistCover } from '../../composables/usePlaybackActions'
import { allTracks, likedIds, onlineMetaToTrack, playlists, recent } from '../../stores/library'
import * as online from '../../stores/online'
import * as player from '../../stores/player'
import * as radio from '../../stores/radio'
import * as ui from '../../stores/ui'
import { formatListeners, greeting, todayLabel } from '../../utils/format'
import type { Track } from '../../types/music'

/**
 * 发现页 —— 每天的入口，而不是作品展示页。
 *
 * 情绪标签刻意做成**对真实内容的显式映射**：每个标签同时指向一个 Audius 风格与一个
 * SomaFM 频道分类，选中的标签会把映射关系写在标题里（如「夜晚 · 氛围 / Drone Zone」）。
 * 没有凭空生成的「情绪歌单」。
 */

interface Mood {
  key: string
  label: string
  /** 对应 online store 的风格键 */
  genreKey: string
  /** 对应电台分组的中文名 */
  radioGenre: string
}

const MOODS: Mood[] = [
  { key: 'night', label: '夜晚', genreKey: 'ambient', radioGenre: '氛围' },
  { key: 'heal', label: '治愈', genreKey: 'rnb', radioGenre: '休闲' },
  { key: 'focus', label: '专注', genreKey: 'electronic', radioGenre: '电子' },
  { key: 'commute', label: '通勤', genreKey: 'pop', radioGenre: '流行' },
  { key: 'relax', label: '放松', genreKey: 'jazz', radioGenre: '爵士' }
]

const activeMood = ref<Mood | null>(null)

const selectMood = (mood: Mood): void => {
  // 再点一次取消
  if (activeMood.value?.key === mood.key) {
    activeMood.value = null
    return
  }
  activeMood.value = mood
  online.selectGenre(mood.genreKey)
}

onMounted(() => {
  void online.loadChart()
  void radio.loadRadioChannels()
})

/* ------------------------------ 派生数据 ------------------------------ */

const onlineTracks = computed(() => online.currentChart.value?.tracks ?? [])

/** 新歌推荐：在线榜单前 6 首。 */
const newReleases = computed(() => onlineTracks.value.slice(0, 6))

/** 电台推荐：有情绪标签时按分类过滤，否则取在线人数最高的几个。 */
const radioPicks = computed(() => {
  const channels = radio.radioChannels.value
  const matched = activeMood.value
    ? channels.filter((channel) => channel.genre === activeMood.value?.radioGenre)
    : []
  const pool = matched.length ? matched : channels
  return [...pool].sort((a, b) => b.listeners - a.listeners).slice(0, 4)
})

/** 情绪映射说明，显示在区块标题旁，让用户看得见内容从哪来。 */
const moodNote = computed(() =>
  activeMood.value
    ? `${activeMood.value.label} · ${online.currentChart.value?.genreLabel ?? ''} / ${activeMood.value.radioGenre}`
    : ''
)

/** 每日推荐：收藏加权 + 播放次数加权，同一天内结果稳定。 */
const dailyTracks = computed<Track[]>(() => {
  const seed = todayLabel()
  let n = 0
  for (const char of seed) n = (n * 31 + char.charCodeAt(0)) >>> 0
  const rand = (): number => {
    n = (n * 1103515245 + 12345) >>> 0
    return n / 2 ** 32
  }
  return allTracks.value
    .map((track) => ({
      track,
      score:
        (likedIds.value.has(track.id) ? 2 : 1) +
        (recent.value.find((item) => item.id === track.id)?.count ?? 0) * 0.5 +
        rand()
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track)
    .slice(0, 6)
})

const playOnline = (track: Track): void => {
  void player.playTrack(track)
}

const playRadio = (channelId: string): void => {
  // 整目录作为队列，点哪个从哪个开始 —— 与电台页行为一致
  const index = radio.radioChannels.value.findIndex((item) => item.id === channelId)
  if (index < 0) return
  void player.playTracks(radio.radioChannels.value.map(radio.radioChannelToTrack), 'radio', index)
}
</script>

<template>
  <section class="page-view discover-view">
    <!-- 问候 + 情绪标签：替代原来的巨大 Hero -->
    <header class="greeting">
      <div class="greeting-copy">
        <h1>{{ greeting() }}，聆听者</h1>
        <p>今天想听什么？</p>
      </div>
      <div class="mood-row">
        <button
          v-for="mood in MOODS"
          :key="mood.key"
          :class="['mood-chip', { active: activeMood?.key === mood.key }]"
          @click="selectMood(mood)"
        >
          {{ mood.label }}
        </button>
      </div>
    </header>

    <!-- 每日推荐 -->
    <section class="block">
      <SectionHeading
        :title="activeMood ? `${activeMood.label}推荐` : '每日推荐'"
        :note="moodNote || todayLabel()"
        action="播放全部"
        @action="playAll(dailyTracks, 'library')"
      />
      <div class="two-col">
        <SongRow
          v-for="(track, index) in dailyTracks"
          :key="track.id"
          :track="track"
          :index="index + 1"
          @play="playOnline"
        />
      </div>
    </section>

    <!-- 新歌推荐 -->
    <section class="block">
      <SectionHeading
        title="新歌推荐"
        :note="`${online.currentChart.value?.genreLabel ?? ''} · ${online.currentChart.value?.periodLabel ?? ''}`"
        action="完整榜单"
        @action="ui.navigate('charts')"
      />
      <div v-if="newReleases.length" class="two-col">
        <SongRow
          v-for="track in newReleases"
          :key="track.id"
          :track="onlineMetaToTrack(track)"
          use-rank
          @play="playOnline"
        />
      </div>
      <p v-else-if="online.chartLoading.value" class="hint">正在获取在线榜单…</p>
      <p v-else class="hint">暂时取不到在线榜单，本地曲库不受影响。</p>
    </section>

    <!-- 热门歌单 -->
    <section class="block">
      <SectionHeading title="热门歌单" action="查看全部" @action="ui.navigate('library')" />
      <div class="card-grid">
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

    <!-- 电台 -->
    <section class="block">
      <SectionHeading
        title="声音频道"
        :note="
          radio.radioTotalListeners.value
            ? `全部频道 ${formatListeners(radio.radioTotalListeners.value)}`
            : ''
        "
        action="进入电台"
        @action="ui.navigate('radio')"
      />
      <div class="card-grid">
        <MediaCard
          v-for="channel in radioPicks"
          :key="channel.id"
          :cover="{ kind: 'url', url: channel.coverUrl }"
          :title="channel.title"
          :badge="formatListeners(channel.listeners)"
          :description="channel.description"
          :playing="player.currentId.value === channel.id && player.isPlaying.value"
          @play="playRadio(channel.id)"
        />
      </div>
    </section>
  </section>
</template>

<style scoped>
.greeting {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 34px;
}
.greeting-copy h1 {
  color: var(--text-1);
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.greeting-copy p {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 16px;
}

.mood-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mood-chip {
  padding: 7px 16px;
  border: 1px solid var(--divider);
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: var(--surface);
  font-size: 14px;
  transition:
    color var(--dur-1) ease,
    border-color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.mood-chip:hover {
  color: var(--text-1);
  border-color: var(--text-3);
}
.mood-chip.active {
  color: var(--on-brand);
  border-color: var(--brand);
  background: var(--brand);
}

.block {
  margin-top: 40px;
}

/* 双列是为了提高信息密度：一行放两首，减少滚动 */
.two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 20px;
}
@media (max-width: 1240px) {
  .two-col {
    grid-template-columns: minmax(0, 1fr);
  }
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: 18px;
}

.hint {
  padding: 18px 0;
  color: var(--text-3);
  font-size: 14px;
}
</style>

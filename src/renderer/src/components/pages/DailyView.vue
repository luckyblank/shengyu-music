<script lang="ts">
import { ref } from 'vue'

/**
 * 「换一换」的扰动计数。
 *
 * 必须放在模块作用域：App.vue 用 <component :is> 只挂载当前页，离开推荐页组件就被卸载，
 * 写在 setup 里的 ref 会一起重置 —— 换一换之后去排行榜再回来，顺序会悄悄变回默认。
 *
 * 两个 script 块编译进同一个模块作用域，所以 ref 只在这里 import 一次，下面直接用。
 */
const rerollTick = ref(0)
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import MediaCard from '../music/MediaCard.vue'
import PhotoCard from '../music/PhotoCard.vue'
import SectionHeading from '../music/SectionHeading.vue'
import SongList from '../music/SongList.vue'
import { playPlaylist, playlistCover } from '../../composables/usePlaybackActions'
import { photoCover } from '../../data/catalog'
import {
  allTracks,
  likedIds,
  likedTracks,
  onlineMetaToTrack,
  playlists,
  playStats,
  recent,
  recentTracks,
  trackById
} from '../../stores/library'
import * as online from '../../stores/online'
import * as player from '../../stores/player'
import * as radio from '../../stores/radio'
import * as ui from '../../stores/ui'
import { formatListeners, todayKey } from '../../utils/format'
import type { AppPage, CoverSpec, QueueLabel, Track } from '../../types/music'
import type { RadioChannel } from '@shared/ipc'

/**
 * 推荐页 —— 每日推荐 / 收藏 / 播放记录的聚合入口。
 *
 * 所有栏目都由真实信号算出：收藏加权 + 播放次数加权，再叠一个**按日期固定种子**的随机项，
 * 所以同一天内多次打开顺序一致、跨天才换。「换一换」手动递增扰动计数，立刻重排。
 * 卡片上的文案（如「新歌速递」）沿用设计稿的措辞，具体取数写在各自的注释里。
 */

/* -------------------------------- 情绪标签 -------------------------------- */

interface Mood {
  key: string
  label: string
  /** 对应 online store 的风格键 */
  genreKey: string
}

/** 默认露出的 7 个情绪（设计稿的那一排） */
const MOODS: Mood[] = [
  { key: 'night', label: '夜晚', genreKey: 'ambient' },
  { key: 'heal', label: '治愈', genreKey: 'rnb' },
  { key: 'focus', label: '专注', genreKey: 'electronic' },
  { key: 'commute', label: '通勤', genreKey: 'pop' },
  { key: 'relax', label: '放松', genreKey: 'jazz' },
  { key: 'sport', label: '运动', genreKey: 'house' },
  { key: 'work', label: '工作', genreKey: 'indie' }
]

/**
 * 「···」后面的情绪。
 * 情绪词比流派细，允许多个情绪落到同一风格上；选中态按 key 判定，所以 夜晚 / 深夜 不会互相点亮。
 */
const MORE_MOODS: Mood[] = [
  { key: 'late', label: '深夜', genreKey: 'ambient' },
  { key: 'noon', label: '午后', genreKey: 'jazz' },
  { key: 'party', label: '派对', genreKey: 'house' },
  { key: 'street', label: '街头', genreKey: 'hiphop' },
  { key: 'rock', label: '摇滚', genreKey: 'rock' }
]

const HERO_LINES: [string, string][] = [
  ['用音乐', '陪伴每一个平凡的日子'],
  ['在深夜', '给你留一盏不灭的灯'],
  ['每一首歌', '都值得被认真听完']
]

const activeMood = ref<Mood | null>(null)
const moreMoodsOpen = ref(false)
const heroMenuOpen = ref(false)

const visibleMoods = computed<Mood[]>(() => {
  if (moreMoodsOpen.value) return [...MOODS, ...MORE_MOODS]
  const active = activeMood.value
  // 收起后如果选中的是隐藏情绪，把它留在可见行里，否则会出现「筛选生效但看不到选中项」
  return active && !MOODS.includes(active) ? [...MOODS, active] : MOODS
})

/* -------------------------------- 种子随机 -------------------------------- */

/** 同一个 salt 在同一天、同一扰动次数下给出同一个种子。 */
const seedOf = (salt: string): number => {
  let n = 0
  for (const char of `${todayKey()}|${rerollTick.value}|${salt}`) {
    n = (n * 31 + char.charCodeAt(0)) >>> 0
  }
  return n
}

/** 确定性伪随机：模块里只借用一次，避免用 Math.random 让每次渲染都换一套。 */
const makeRand = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) >>> 0
    return state / 2 ** 32
  }
}

/* -------------------------------- 播放控制 -------------------------------- */

/**
 * 某个集合是否正在播放。
 *
 * 队列里没有「集合 id」这种东西，唯一能判定的身份就是成员完全一致：
 * 长度相等且逐个 id 对齐（playTracks 按传入顺序入队，去重后顺序不变）。
 */
const isPlayingCollection = (tracks: Track[]): boolean => {
  if (!player.isPlaying.value || !tracks.length) return false
  if (player.queue.value.length !== tracks.length) return false
  return player.queue.value.every((id, index) => id === tracks[index].id)
}

/** 已在播放的集合再点一次就是暂停，其余情况重新入队从头播。 */
const playCollection = (tracks: Track[], label: QueueLabel): void => {
  if (!tracks.length) return
  if (isPlayingCollection(tracks)) {
    void player.toggle()
    return
  }
  void player.playTracks(tracks, label)
}

const playOnline = (track: Track): void => {
  void player.playTrack(track)
}

const playRadio = (channelId: string): void => {
  // 整目录作为队列，点哪个从哪个开始 —— 与电台页行为一致
  const index = radio.radioChannels.value.findIndex((item) => item.id === channelId)
  if (index < 0) return
  void player.playTracks(radio.radioChannels.value.map(radio.radioChannelToTrack), 'radio', index)
}

const radioCover = (channel: RadioChannel): CoverSpec =>
  channel.coverUrl ? { kind: 'url', url: channel.coverUrl } : photoCover('tide')

/* -------------------------------- 派生数据 -------------------------------- */

/** 今日推荐：收藏加权 + 播放次数加权 + 日期种子随机项。 */
const dailyTracks = computed<Track[]>(() => {
  const rand = makeRand(seedOf('daily'))
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
    .slice(0, 20)
})

const heroLines = computed(() => HERO_LINES[seedOf('hero') % HERO_LINES.length])
const heroCover = photoCover('ember')
const heroPlaying = computed(() => isPlayingCollection(dailyTracks.value))

const chartTracks = computed(() => online.currentChart.value?.tracks ?? [])
const chartPlayable = computed<Track[]>(() => chartTracks.value.map(onlineMetaToTrack))

/** 私人雷达：收藏优先，其次是与收藏同风格且没听过的，最后补没听过的其余曲目。 */
const radarTracks = computed<Track[]>(() => {
  const heard = new Set(recent.value.map((item) => item.id))
  const likedGenres = new Set(
    likedTracks.value.map((track) => track.genre).filter((genre): genre is string => Boolean(genre))
  )
  const fresh = allTracks.value.filter(
    (track) => !heard.has(track.id) && !likedIds.value.has(track.id)
  )
  const sameGenre = fresh.filter((track) => track.genre && likedGenres.has(track.genre))
  const rest = fresh.filter((track) => !sameGenre.includes(track))
  return [...likedTracks.value, ...sameGenre, ...rest].slice(0, 12)
})

/** 心情歌单：跟随选中情绪对应的在线风格；没选情绪时用总榜，所以这张卡一直有内容。 */
const moodTracks = computed<Track[]>(() => chartPlayable.value.slice(0, 12))

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/

/**
 * 华语精选：标题或歌手含中日韩统一表意文字就算。
 * 这是**启发式**，元数据里没有语种字段 —— 设计稿的文案比数据源更细的地方都在此如实说明。
 */
const chinesePicks = computed<Track[]>(() =>
  allTracks.value.filter((track) => CJK.test(track.title) || CJK.test(track.artist)).slice(0, 12)
)

/** 新歌速递：取榜单中段（第 7 位起），避开排行榜卡片已经铺过的前几名。 */
const freshTracks = computed<Track[]>(() => chartPlayable.value.slice(6, 20))

/** 睡前音乐：只用带真实 bpm 配方的曲目（演示曲），从慢到快。 */
const sleepTracks = computed<Track[]>(() =>
  allTracks.value
    .filter((track) => (track.synth?.bpm ?? 999) < 90)
    .sort((a, b) => (a.synth?.bpm ?? 0) - (b.synth?.bpm ?? 0))
    .slice(0, 12)
)

interface Showcase {
  key: string
  title: string
  subtitle: string
  cover: CoverSpec
  tracks: Track[]
  /** 队列来源标签：本地派生的用 library，在线榜单用 charts */
  label: QueueLabel
}

/** 设计稿的 6 张照片卡。取不到内容的卡片直接不出现，而不是给一张空卡。 */
const showcases = computed<Showcase[]>(() => {
  const items: Showcase[] = [
    {
      key: 'daily',
      title: '今日推荐',
      subtitle: '每日为你精选',
      cover: photoCover('ember'),
      tracks: dailyTracks.value,
      label: 'library'
    },
    {
      key: 'radar',
      title: '私人雷达',
      subtitle: '你可能喜欢的音乐',
      cover: photoCover('tide'),
      tracks: radarTracks.value,
      label: 'library'
    },
    {
      key: 'mood',
      title: '心情歌单',
      subtitle: '此刻的你值得更好的歌',
      cover: photoCover('violet'),
      tracks: moodTracks.value,
      label: 'charts'
    },
    {
      key: 'chinese',
      title: '华语精选',
      subtitle: '好歌不止一面',
      cover: photoCover('moss'),
      tracks: chinesePicks.value,
      label: 'library'
    },
    {
      key: 'fresh',
      title: '新歌速递',
      subtitle: '最新发行 · 每日更新',
      cover: photoCover('sand'),
      tracks: freshTracks.value,
      label: 'charts'
    },
    {
      key: 'sleep',
      title: '睡前音乐',
      subtitle: '陪你安心入眠',
      cover: photoCover('night'),
      tracks: sleepTracks.value,
      label: 'library'
    }
  ]
  return items.filter((item) => item.tracks.length > 0)
})

/* ------------------------------ 发现更多（Tab） ------------------------------ */

type DiscoverTab = 'playlists' | 'charts' | 'radio' | 'newReleases' | 'stories'

const TABS: { key: DiscoverTab; label: string; more: AppPage }[] = [
  { key: 'playlists', label: '热门歌单', more: 'library' },
  { key: 'charts', label: '排行榜', more: 'charts' },
  { key: 'radio', label: '电台', more: 'radio' },
  { key: 'newReleases', label: '新歌推荐', more: 'charts' },
  { key: 'stories', label: '音乐故事', more: 'report' }
]

const activeTab = ref<DiscoverTab>('playlists')
const tabMoreTarget = computed<AppPage>(
  () => TABS.find((tab) => tab.key === activeTab.value)?.more ?? 'discover'
)

const chartCards = computed<Track[]>(() => chartPlayable.value.slice(0, 8))
const newReleases = computed<Track[]>(() => chartPlayable.value.slice(6, 12))
const radioCards = computed<RadioChannel[]>(() =>
  [...radio.radioChannels.value].sort((a, b) => b.listeners - a.listeners).slice(0, 8)
)

const chartHint = computed(() =>
  online.chartLoading.value ? '正在获取在线榜单…' : '暂时取不到在线榜单，本地曲库不受影响。'
)

interface Story {
  key: string
  title: string
  description: string
  cover: CoverSpec
  tracks: Track[]
}

/** 音乐故事：只讲播放记录里真能算出来的结论，一条都算不出来时整块让位给提示文案。 */
const stories = computed<Story[]>(() => {
  const items: Story[] = []

  const topArtist = Object.entries(playStats.value.artists).sort((a, b) => b[1] - a[1])[0]
  if (topArtist) {
    const byArtist = allTracks.value.filter((track) => track.artist === topArtist[0])
    if (byArtist.length) {
      items.push({
        key: 'artist',
        title: '你的高频音乐人',
        description: `播放最多的是 ${topArtist[0]}，共 ${topArtist[1]} 次`,
        cover: photoCover('violet'),
        tracks: byArtist.slice(0, 10)
      })
    }
  }

  const lateIds = new Set(
    recent.value
      .filter((item) => {
        const hour = new Date(item.at).getHours()
        return hour >= 23 || hour < 5
      })
      .map((item) => item.id)
  )
  const lateTracks = recentTracks.value.filter((track) => lateIds.has(track.id)).slice(0, 10)
  if (lateTracks.length) {
    items.push({
      key: 'late',
      title: '深夜的耳朵',
      description: `23 点后或凌晨听过的 ${lateTracks.length} 首`,
      cover: photoCover('night'),
      tracks: lateTracks
    })
  }

  if (likedTracks.value.length) {
    items.push({
      key: 'liked',
      title: '收藏的回响',
      description: `你收藏的 ${likedIds.value.size} 首，随时可以重听`,
      cover: photoCover('ember'),
      tracks: likedTracks.value.slice(0, 10)
    })
  }

  const mostPlayed = [...recent.value]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((entry) => trackById(entry.id))
    .filter((track): track is Track => Boolean(track))
  if (mostPlayed.length) {
    items.push({
      key: 'repeat',
      title: '本周常听',
      description: `播放次数最高的 ${mostPlayed.length} 首`,
      cover: photoCover('tide'),
      tracks: mostPlayed
    })
  }

  return items
})

/* -------------------------------- 推荐依据 -------------------------------- */

/** 推荐依据里实际生效的几个信号，如实写出来 */
const basis = computed(() => {
  const liked = dailyTracks.value.filter((track) => likedIds.value.has(track.id)).length
  const played = dailyTracks.value.filter(
    (track) => (recent.value.find((item) => item.id === track.id)?.count ?? 0) > 0
  ).length
  return { liked, played, fresh: dailyTracks.value.length - liked - played }
})

const basisNote = computed(
  () =>
    `收藏 ${basis.value.liked} 首 · 听过 ${basis.value.played} 首 · 新面孔 ${basis.value.fresh} 首`
)

/* --------------------------------- 交互 --------------------------------- */

const reroll = (): void => {
  rerollTick.value += 1
  heroMenuOpen.value = false
}

const openBasis = (): void => {
  heroMenuOpen.value = false
  ui.navigate('report')
}

const selectMood = (mood: Mood): void => {
  if (activeMood.value?.key === mood.key) {
    activeMood.value = null
    // 取消情绪后回到总榜，否则心情歌单会停在上一情绪的风格上而界面上没有任何标记
    online.selectGenre(online.chartGenres[0].key)
    return
  }
  activeMood.value = mood
  online.selectGenre(mood.genreKey)
}

const onDocumentDown = (event: MouseEvent): void => {
  const target = event.target as HTMLElement | null
  if (target?.closest('.hero-menu')) return
  heroMenuOpen.value = false
}

const onDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') heroMenuOpen.value = false
}

onMounted(() => {
  void online.loadChart()
  void radio.loadRadioChannels()
  document.addEventListener('mousedown', onDocumentDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <section class="page-view">
    <header class="page-head">
      <div class="page-title">
        <h1>推荐</h1>
        <p>懂你所爱，每一首歌都有故事</p>
      </div>
      <div class="page-actions">
        <button class="soft-btn accent" @click="ui.navigate('report')">
          <AppIcon name="spark" :size="14" />个性化推荐
        </button>
        <button class="soft-btn" @click="reroll">
          <AppIcon name="refresh" :size="14" />换一换
        </button>
      </div>
    </header>

    <!-- 照片头图：文案压在渐变上，保证任意照片上都能读清 -->
    <section class="hero">
      <CoverArt :cover="heroCover" size="large" class="hero-cover" />
      <span class="hero-scrim"></span>
      <div class="hero-copy">
        <h2>
          {{ heroLines[0] }}<br />
          {{ heroLines[1] }}
        </h2>
        <p>今日推荐 · 为你精选 {{ dailyTracks.length }} 首歌曲</p>
        <button
          class="hero-play"
          :disabled="!dailyTracks.length"
          @click="playCollection(dailyTracks, 'library')"
        >
          <AppIcon :name="heroPlaying ? 'pause' : 'play'" :size="15" />
          {{ heroPlaying ? '暂停播放' : '点击播放' }}
        </button>
      </div>
      <div class="hero-menu">
        <button
          class="hero-more"
          aria-label="更多推荐操作"
          :aria-expanded="heroMenuOpen"
          @click="heroMenuOpen = !heroMenuOpen"
        >
          <AppIcon name="more" :size="18" />
        </button>
        <Transition name="pop">
          <div v-if="heroMenuOpen" class="menu-pop">
            <button @click="reroll"><AppIcon name="refresh" :size="14" />换一换推荐</button>
            <button @click="openBasis"><AppIcon name="spark" :size="14" />查看推荐依据</button>
          </div>
        </Transition>
      </div>
    </section>

    <!-- 情绪标签：只做筛选，不编造情绪数据 —— 选中的情绪直接驱动在线榜单风格 -->
    <div class="moods">
      <button
        v-for="mood in visibleMoods"
        :key="mood.key"
        class="mood-chip"
        :class="{ active: activeMood?.key === mood.key }"
        @click="selectMood(mood)"
      >
        {{ mood.label }}
      </button>
      <button
        class="mood-chip mood-more"
        :class="{ active: moreMoodsOpen }"
        :aria-expanded="moreMoodsOpen"
        aria-label="更多情绪"
        @click="moreMoodsOpen = !moreMoodsOpen"
      >
        <AppIcon name="more" :size="15" />
      </button>
    </div>

    <!-- 每日推荐：6 张照片卡 -->
    <section class="block">
      <SectionHeading
        title="每日推荐"
        note="根据你的听歌习惯为你精选"
        note-tone="brand"
        action="播放全部"
        action-icon="play"
        @action="playCollection(dailyTracks, 'library')"
      />
      <div v-if="showcases.length" class="card-grid">
        <PhotoCard
          v-for="item in showcases"
          :key="item.key"
          :cover="item.cover"
          :title="item.title"
          :subtitle="item.subtitle"
          :playing="isPlayingCollection(item.tracks)"
          @play="playCollection(item.tracks, item.label)"
        />
      </div>
      <p v-else class="hint">曲库还是空的，先导入一些音乐吧。</p>
      <p v-if="online.chartLoading.value" class="hint">正在获取在线榜单，部分栏目稍后出现…</p>
    </section>

    <!-- 发现更多 -->
    <section class="block">
      <div class="discover-head">
        <h2>发现更多</h2>
        <div class="tabs">
          <button
            v-for="tab in TABS"
            :key="tab.key"
            class="tab"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
        <button class="more-link" @click="ui.navigate(tabMoreTarget)">
          查看全部<AppIcon name="arrow" :size="14" />
        </button>
      </div>

      <div v-if="activeTab === 'playlists'" class="card-grid">
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

      <div v-else-if="activeTab === 'charts'" class="card-grid">
        <MediaCard
          v-for="(track, index) in chartCards"
          :key="track.id"
          :cover="track.cover"
          :title="track.title"
          :subtitle="track.artist"
          :badge="`#${index + 1}`"
          :playing="player.currentId.value === track.id && player.isPlaying.value"
          @play="playOnline(track)"
          @open="ui.navigate('charts')"
        />
      </div>

      <div v-else-if="activeTab === 'radio'" class="card-grid">
        <MediaCard
          v-for="channel in radioCards"
          :key="channel.id"
          :cover="radioCover(channel)"
          :title="channel.title"
          :badge="formatListeners(channel.listeners)"
          :description="channel.description"
          :playing="player.currentId.value === channel.id && player.isPlaying.value"
          @play="playRadio(channel.id)"
          @open="ui.navigate('radio')"
        />
      </div>

      <div v-else-if="activeTab === 'newReleases'" class="card-grid">
        <MediaCard
          v-for="track in newReleases"
          :key="track.id"
          :cover="track.cover"
          :title="track.title"
          :subtitle="track.artist"
          :playing="player.currentId.value === track.id && player.isPlaying.value"
          @play="playOnline(track)"
          @open="ui.navigate('charts')"
        />
      </div>

      <div v-else class="card-grid">
        <MediaCard
          v-for="story in stories"
          :key="story.key"
          :cover="story.cover"
          :title="story.title"
          :description="story.description"
          :playing="isPlayingCollection(story.tracks)"
          @play="playCollection(story.tracks, 'library')"
          @open="ui.navigate('report')"
        />
      </div>

      <p v-if="activeTab === 'charts' && !chartCards.length" class="hint">{{ chartHint }}</p>
      <p v-else-if="activeTab === 'newReleases' && !newReleases.length" class="hint">
        {{ chartHint }}
      </p>
      <p v-else-if="activeTab === 'radio' && !radioCards.length" class="hint">
        {{ radio.radioLoading.value ? '正在获取声音频道…' : '暂时取不到声音频道。' }}
      </p>
      <p v-else-if="activeTab === 'stories' && !stories.length" class="hint">
        听过几首歌之后，这里会长出你自己的故事。
      </p>
    </section>

    <!-- 推荐歌曲：照片卡下方保留列表，右侧右键菜单等既有能力一并留着 -->
    <section class="block">
      <SectionHeading
        title="推荐歌曲"
        :note="basisNote"
        action="播放全部"
        action-icon="play"
        @action="playCollection(dailyTracks, 'library')"
      />
      <p class="basis">同一天内顺序固定，跨天才换；点「换一换」立即重排。</p>
      <SongList v-if="dailyTracks.length" :tracks="dailyTracks" show-album show-origin />
      <p v-else class="state">曲库还是空的，先导入一些音乐吧。</p>
    </section>
  </section>
</template>

<style scoped>
/* --------------------------------- 页头 --------------------------------- */
.page-head {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 22px;
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
  align-items: center;
}
.soft-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: var(--surface-soft);
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease,
    box-shadow var(--dur-1) ease;
}
.soft-btn:hover {
  color: var(--text-1);
  background: var(--surface-soft-hover);
}
/* 「个性化推荐」是入口而不是普通动作，用品牌浅底与「换一换」拉开层级 */
.soft-btn.accent {
  color: var(--brand);
  background: var(--brand-soft);
}
.soft-btn.accent:hover {
  box-shadow: inset 0 0 0 1px var(--brand-ring);
}

/* --------------------------------- 头图 --------------------------------- */
.hero {
  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: 220px;
  padding: 26px 30px;
  overflow: hidden;
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-card);
  isolation: isolate;
}
/* 照片铺满整块：CoverArt 自带 large 尺寸依赖宽度，这里改成绝对定位铺底 */
.hero :deep(.cover-art) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: var(--r-xl);
  box-shadow: none;
}
.hero-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(10, 14, 20, 0.88) 0%,
    rgba(10, 14, 20, 0.62) 46%,
    rgba(10, 14, 20, 0.18) 100%
  );
}
/* 照片上的文字固定用白色，不跟随主题 —— 与 MV / 正在播放页一致 */
.hero-copy {
  position: relative;
  color: #fff;
}
.hero-copy h2 {
  font-size: 30px;
  font-weight: 600;
  line-height: 1.32;
  letter-spacing: -0.01em;
  text-shadow: 0 1px 12px rgba(8, 12, 18, 0.45);
}
.hero-copy p {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
}
.hero-play {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  height: 36px;
  margin-top: 16px;
  padding: 0 20px;
  border-radius: var(--r-pill);
  color: var(--on-brand);
  background: var(--brand);
  font-size: 14px;
  transition: background var(--dur-1) ease;
}
.hero-play:hover {
  background: var(--brand-hover);
}
.hero-play:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hero-menu {
  position: absolute;
  top: 16px;
  right: 16px;
}
.hero-more {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
  transition: background var(--dur-1) ease;
}
.hero-more:hover {
  background: rgba(255, 255, 255, 0.3);
}
.menu-pop {
  position: absolute;
  top: 40px;
  right: 0;
  display: flex;
  flex-direction: column;
  min-width: 172px;
  padding: 6px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
}
.menu-pop button {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  color: var(--text-2);
  font-size: 13px;
  text-align: left;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.menu-pop button:hover {
  color: var(--text-1);
  background: var(--surface-soft);
}
.pop-enter-active,
.pop-leave-active {
  transition:
    opacity var(--dur-1) ease,
    transform var(--dur-2) var(--ease);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ------------------------------- 情绪标签 ------------------------------- */
.moods {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 22px;
}
.mood-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: var(--surface-soft);
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease,
    border-color var(--dur-1) ease;
}
.mood-chip:hover {
  color: var(--text-1);
  background: var(--surface-soft-hover);
}
.mood-chip.active {
  color: var(--brand);
  border-color: var(--brand-ring);
  background: var(--brand-soft);
}
.mood-more {
  width: 32px;
  padding: 0;
}

/* --------------------------------- 区块 --------------------------------- */
.block {
  margin-top: 40px;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 18px;
}
.hint {
  padding: 14px 0;
  color: var(--text-3);
  font-size: 14px;
}

.discover-head {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  margin-bottom: 18px;
}
.discover-head h2 {
  color: var(--text-1);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.tabs {
  display: flex;
  gap: 4px;
  margin-right: auto;
}
.tab {
  position: relative;
  padding: 6px 12px;
  border-radius: var(--r-sm);
  color: var(--text-2);
  background: transparent;
  font-size: 14px;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.tab:hover {
  color: var(--text-1);
  background: var(--surface-soft);
}
.tab.active {
  color: var(--brand);
  font-weight: 500;
}
/* 下划线只跟文字等宽，不铺满整格 —— 网易云 / Spotify 的 Tab 观感 */
.tab.active::after {
  position: absolute;
  right: 12px;
  bottom: 0;
  left: 12px;
  height: 2px;
  border-radius: 2px;
  background: var(--brand);
  content: '';
}
.more-link {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    gap var(--dur-1) ease;
}
.more-link:hover {
  gap: 7px;
  color: var(--brand);
}

/* ------------------------------- 推荐歌曲 ------------------------------- */
.basis {
  margin-bottom: 14px;
  color: var(--text-3);
  font-size: 13px;
}
.state {
  padding: 70px 0;
  color: var(--text-3);
  font-size: 15px;
  text-align: center;
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import TrackMenu, { type TrackMenuState } from '../TrackMenu.vue'
import { openPlaylist, playAll, playlistCover } from '../../composables/usePlaybackActions'
import { photoCover } from '../../data/catalog'
import {
  allTracks,
  likedIds,
  likedTracks,
  onlineMetaToTrack,
  playlists,
  recent,
  toggleLike
} from '../../stores/library'
import * as online from '../../stores/online'
import * as player from '../../stores/player'
import * as radio from '../../stores/radio'
import * as ui from '../../stores/ui'
import { formatTime, greeting, todayLabel } from '../../utils/format'
import type { AppPage, CoverSpec, QueueLabel, Track } from '../../types/music'

/**
 * 发现页 —— 按设计稿（1595×986）复刻：照片头图 / 为你推荐 / 热门歌单 / 最新音乐。
 *
 * 尺寸都是量出来的，不是估的：内容区 1284 宽；头图 = 左列 583 + 间距 5 + 照片 697；
 * 推荐卡 243（间距 14）、歌单卡 192（间距 16）、歌曲行两列 636 / 621。
 * 卡片网格一律写成百分比（含间距也是百分比）—— 这样在设计稿的宽度下逐像素对齐，
 * 窗口变窄时整体等比缩小且不会溢出（固定 px 间距会让窄窗口横向溢出）。
 */

interface Mood {
  key: string
  label: string
  /**
   * 设计稿的图标是位图，无法逐像素确证，取语义最接近的现有图标。
   * 见 AppIcon.vue 的图标集；「放松」用的 headphones 是为这张设计稿新增的。
   */
  icon: string
  /** 对应 online store 的风格键：驱动「最新音乐」与「新歌速递」卡 */
  genreKey: string
  /** 对应 SomaFM 的中文分组名：驱动「情绪歌单」卡 */
  radioGenre: string
}

const MOODS: Mood[] = [
  { key: 'night', label: '夜晚', icon: 'moon', genreKey: 'ambient', radioGenre: '氛围' },
  { key: 'heal', label: '治愈', icon: 'heart', genreKey: 'rnb', radioGenre: '休闲' },
  { key: 'focus', label: '专注', icon: 'disc', genreKey: 'electronic', radioGenre: '电子' },
  { key: 'relax', label: '放松', icon: 'headphones', genreKey: 'jazz', radioGenre: '爵士' },
  { key: 'commute', label: '通勤', icon: 'arrow', genreKey: 'pop', radioGenre: '流行' },
  { key: 'work', label: '工作', icon: 'keyboard', genreKey: 'indie', radioGenre: '独立' }
]

/** 默认点亮「夜晚」：设计稿里它就是选中态，也避免页面一进来什么都没有 */
const activeMood = ref<Mood>(MOODS[0])

/**
 * 情绪标签是单选、不取消：它同时决定榜单风格与「情绪歌单」的电台分组，
 * 留一个「全都不选」的空状态毫无意义。
 */
const selectMood = (mood: Mood): void => {
  if (activeMood.value.key === mood.key) return
  activeMood.value = mood
  // selectGenre 内部会自己 loadChart，不要再单独调一次，否则同一个榜单会发两次请求
  online.selectGenre(mood.genreKey)
}

/* ------------------------------ 头图右上角的「···」 ------------------------------ */

interface HeroEntry {
  page: AppPage
  label: string
  icon: string
}

const HERO_MENU: HeroEntry[] = [
  { page: 'radio', label: '电台频道', icon: 'radio' },
  { page: 'charts', label: '排行榜', icon: 'trophy' },
  { page: 'library', label: '我的音乐库', icon: 'library' }
]

const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const moreRef = ref<HTMLElement | null>(null)

const toggleMenu = (): void => {
  menuOpen.value = !menuOpen.value
}

const go = (page: AppPage): void => {
  menuOpen.value = false
  ui.navigate(page)
}

/** 点 ⋯ 自己不能先被文档监听关掉，否则 mousedown 关、click 开，菜单看起来「打不开」 */
const onDocumentDown = (event: MouseEvent): void => {
  if (!menuOpen.value) return
  const target = event.target as Node
  if (menuRef.value?.contains(target) || moreRef.value?.contains(target)) return
  menuOpen.value = false
}

const onDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') menuOpen.value = false
}

onMounted(() => {
  void radio.loadRadioChannels()
  online.selectGenre(activeMood.value.genreKey)
  document.addEventListener('mousedown', onDocumentDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})

/* ------------------------------ 派生数据 ------------------------------ */

/**
 * 今日推荐：收藏加权 + 播放次数加权 + 日期种子随机 —— 同一天内顺序稳定，跨天才换。
 * 种子取自日期字符串的字符哈希而不是 Math.random：每次渲染都换一套会让「今日推荐」名不副实。
 */
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
    .slice(0, 20)
})

/** 私人雷达：收藏优先，其次是从没听过的 —— 已经听过的再推荐算不上「专属」 */
const radarTracks = computed<Track[]>(() => {
  const heard = new Set(recent.value.map((item) => item.id))
  const fresh = allTracks.value.filter(
    (track) => !heard.has(track.id) && !likedIds.value.has(track.id)
  )
  return [...likedTracks.value, ...fresh].slice(0, 20)
})

/** 在线榜单曲目（已转成可播放的本地 Track 形态）；榜单没加载成功时是空数组 */
const chartTracks = computed<Track[]>(() =>
  (online.currentChart.value?.tracks ?? []).map(onlineMetaToTrack)
)

/** 最新音乐：榜单前 6 首；榜单不可用时回落到本地曲库，区块不会空着 */
const freshTracks = computed<Track[]>(() => {
  const fromChart = chartTracks.value.slice(0, 6)
  return fromChart.length ? fromChart : allTracks.value.slice(0, 6)
})

/** 情绪歌单：当前情绪对应的 SomaFM 分组 */
const moodChannelTracks = computed<Track[]>(() =>
  radio.radioChannels.value
    .filter((channel) => channel.genre === activeMood.value.radioGenre)
    .map(radio.radioChannelToTrack)
)

interface Pick {
  key: string
  title: string
  subtitle: string
  cover: CoverSpec
  tracks: Track[]
  label: QueueLabel
  /** 内容为空时的提示语：点了没反应会被当成页面坏了 */
  empty: string
}

const plays = computed<Pick[]>(() => [
  {
    key: 'daily',
    title: '每日推荐',
    subtitle: '根据你的口味生成',
    cover: photoCover('violet'),
    tracks: dailyTracks.value,
    label: 'library',
    empty: '曲库还是空的，先导入一些音乐吧'
  },
  {
    key: 'radar',
    title: '私人雷达',
    subtitle: '专属与你的音乐推荐',
    cover: photoCover('ember'),
    tracks: radarTracks.value,
    label: 'library',
    empty: '还没有足够的收听记录，先随便听几首吧'
  },
  {
    key: 'like',
    title: '猜你喜欢',
    subtitle: '这些歌可能喜欢',
    cover: photoCover('night'),
    tracks: likedTracks.value,
    label: 'library',
    empty: '还没有收藏的歌，点列表里的心形就能收藏'
  },
  {
    key: 'mood',
    title: '情绪歌单',
    subtitle: '此刻，刚好需要这些歌',
    cover: photoCover('sand'),
    tracks: moodChannelTracks.value,
    label: 'radio',
    empty: '这个情绪的电台还没加载出来，稍后再试'
  },
  {
    key: 'fresh',
    title: '新歌速递',
    subtitle: '最新发行，第一时间听',
    cover: photoCover('moss'),
    tracks: chartTracks.value,
    label: 'charts',
    empty: '在线榜单暂时不可用，检查一下网络'
  }
])

const playPick = (pick: Pick): void => {
  if (!pick.tracks.length) {
    ui.toast(pick.empty, 'info')
    return
  }
  playAll(pick.tracks, pick.label)
}

/* ------------------------------ 歌单分页 ------------------------------ */

/** 设计稿一行 6 张；只有自建歌单变多之后才会真正出现第二页 */
const PAGE_SIZE = 6
const pageIndex = ref(0)
const pageCount = computed(() => Math.max(1, Math.ceil(playlists.value.length / PAGE_SIZE)))
/** 删到只剩一页时把页码夹回来，否则会停在某一页上显示空白 */
const safePage = computed(() => Math.min(pageIndex.value, pageCount.value - 1))
const pagedPlaylists = computed(() =>
  playlists.value.slice(safePage.value * PAGE_SIZE, safePage.value * PAGE_SIZE + PAGE_SIZE)
)

const turnPage = (delta: number): void => {
  pageIndex.value = Math.min(Math.max(safePage.value + delta, 0), pageCount.value - 1)
}

/* ------------------------------ 歌曲行 ------------------------------ */

const menu = ref<TrackMenuState | null>(null)

const openMenu = (track: Track, event: MouseEvent): void => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menu.value = { track, x: rect.left, y: rect.bottom + 4 }
}

/** 正在播放的那首才有底色；暂停时不再高亮，与歌曲列表保持一致 */
const playingId = computed(() => (player.isPlaying.value ? player.currentId.value : null))

const playOne = (track: Track): void => {
  void player.playTrack(track)
}

const like = (track: Track): void => {
  toggleLike(track.id)
}
</script>

<template>
  <section class="page-view discover-view">
    <!-- 头图：左边问候 + 情绪筛选，右边照片 + 引语 -->
    <section class="dp-hero">
      <div class="dp-hero-copy">
        <h1>{{ greeting() }}，聆听者</h1>
        <p>今天也辛苦了，来点音乐放松一下吧</p>
        <div class="dp-chips">
          <button
            v-for="mood in MOODS"
            :key="mood.key"
            :class="['dp-chip', { 'is-active': mood.key === activeMood.key }]"
            @click="selectMood(mood)"
          >
            <AppIcon :name="mood.icon" :size="20" />
            <span>{{ mood.label }}</span>
          </button>
        </div>
      </div>

      <div class="dp-hero-photo">
        <CoverArt :cover="photoCover('ember')" />

        <div class="dp-quote">
          <span>在音乐里</span>
          <span>与自己安静相处</span>
          <small>音乐，让生活多一种可能</small>
        </div>

        <button ref="moreRef" class="dp-hero-more" title="更多入口" @click="toggleMenu">
          <AppIcon name="more-tight" :size="72" />
        </button>

        <button class="dp-hero-play" title="打开每日推荐" @click="go('daily')">
          <span class="dp-hero-play-dot"><AppIcon name="play" :size="20" /></span>
          <span>今日推荐</span>
        </button>

        <Transition name="dp-pop">
          <div v-if="menuOpen" ref="menuRef" class="dp-menu">
            <button v-for="entry in HERO_MENU" :key="entry.page" @click="go(entry.page)">
              <AppIcon :name="entry.icon" :size="18" />
              <span>{{ entry.label }}</span>
            </button>
          </div>
        </Transition>
      </div>
    </section>

    <!-- 为你推荐 -->
    <section class="dp-block">
      <header class="dp-sec-head">
        <button class="dp-sec-title" title="查看每日推荐" @click="go('daily')">
          <span>为你推荐</span>
          <AppIcon name="chevron-right" :size="24" />
        </button>
      </header>
      <div class="dp-picks">
        <article
          v-for="pick in plays"
          :key="pick.key"
          class="dp-pick"
          role="button"
          tabindex="0"
          @click="playPick(pick)"
          @keydown.enter="playPick(pick)"
        >
          <CoverArt :cover="pick.cover" />
          <span class="dp-pick-scrim" aria-hidden="true"></span>
          <span class="dp-pick-copy">
            <span class="dp-pick-title">{{ pick.title }}</span>
            <span class="dp-pick-sub">{{ pick.subtitle }}</span>
          </span>
          <!-- 行内动作不挂 role/aria：卡片本身已经是交互控件，嵌套交互控件会污染无障碍树 -->
          <span class="dp-pick-play" :title="`播放${pick.title}`" aria-hidden="true">
            <AppIcon name="play" :size="16" />
          </span>
        </article>
      </div>
    </section>

    <!-- 热门歌单 -->
    <section class="dp-block">
      <header class="dp-sec-head">
        <button class="dp-sec-title" title="查看全部歌单" @click="go('library')">
          <span>热门歌单</span>
          <AppIcon name="chevron-right" :size="24" />
        </button>
        <div class="dp-pager">
          <button title="上一页" :disabled="safePage === 0" @click="turnPage(-1)">
            <AppIcon name="chevron-left" :size="24" />
          </button>
          <button title="下一页" :disabled="safePage >= pageCount - 1" @click="turnPage(1)">
            <AppIcon name="chevron-right" :size="24" />
          </button>
        </div>
      </header>
      <div class="dp-playlists">
        <button
          v-for="playlist in pagedPlaylists"
          :key="playlist.id"
          class="dp-playlist"
          @click="openPlaylist(playlist)"
        >
          <span class="dp-playlist-cover">
            <CoverArt :cover="playlistCover(playlist)" />
            <!-- 设计稿这里是播放量，曲库里没有这个字段 —— 用真实曲目数，不编数据 -->
            <span class="dp-playlist-badge">
              <AppIcon name="headphones" :size="20" />
              <em>{{ playlist.trackIds.length }} 首</em>
            </span>
          </span>
          <span class="dp-playlist-title">{{ playlist.title }}</span>
        </button>
      </div>
    </section>

    <!-- 最新音乐 -->
    <section class="dp-block dp-block--last">
      <header class="dp-sec-head">
        <button class="dp-sec-title" title="查看排行榜" @click="go('charts')">
          <span>最新音乐</span>
          <AppIcon name="chevron-right" :size="24" />
        </button>
        <button class="dp-more-link" @click="go('charts')">
          <span>查看更多</span>
          <AppIcon name="arrow" :size="24" />
        </button>
      </header>
      <div v-if="freshTracks.length" class="dp-songs">
        <button
          v-for="track in freshTracks"
          :key="track.id"
          :class="['dp-song', { current: track.id === playingId }]"
          :title="`${track.title} · ${track.artist}`"
          @dblclick="playOne(track)"
          @keydown.enter="playOne(track)"
        >
          <CoverArt :cover="track.cover" />
          <span class="dp-song-copy">
            <span class="dp-song-title">{{ track.title }}</span>
            <span class="dp-song-artist">{{ track.artist }}</span>
          </span>
          <span class="dp-song-actions">
            <span class="dp-song-time">{{ formatTime(track.duration) }}</span>
            <!-- 双击必须一并拦下，否则双击收藏会顺带触发整行的播放 -->
            <span
              :class="['dp-song-icon', { liked: likedIds.has(track.id) }]"
              :title="likedIds.has(track.id) ? '取消收藏' : '收藏'"
              aria-hidden="true"
              @click.stop="like(track)"
              @dblclick.stop
            >
              <AppIcon name="heart" :size="24" />
            </span>
            <span
              class="dp-song-icon"
              title="更多"
              aria-hidden="true"
              @click.stop="openMenu(track, $event)"
              @dblclick.stop
            >
              <AppIcon name="more" :size="24" />
            </span>
          </span>
        </button>
      </div>
      <p v-else class="dp-hint">
        {{
          online.chartLoading.value ? '正在获取在线榜单…' : '暂时取不到在线榜单，本地曲库不受影响。'
        }}
      </p>
    </section>

    <TrackMenu v-if="menu" :state="menu" @close="menu = null" />
  </section>
</template>

<style scoped>
/*
 * 覆盖 .page-view 的居中与固定内边距：设计稿的内容区从 x=278 开始、右缘到 1562，
 * 左边距 46 对上「侧栏 232」，右边距本该是 34 —— 但 .scroll-content 是 overflow-y:auto，
 * 滚动条常驻占掉 11.8px（见 base.css 里保留经典滚动条的说明）。不补掉它，
 * 内容区只有 1272 宽：右缘短 12px，六枚药丸 578 宽差 1px 就折成两行，
 * hero 因此高 217 而不是照片的 202，下方所有区块连带下移 15px。
 * width/max-width 也必须放开 —— 卡片按百分比排布，限宽会让右侧留白对不上。
 */
.page-view.discover-view {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 8px 21px 64px 46px;
  /*
   * 设计稿的次级灰阶整体比现有三档令牌深一档、也更偏蓝（slate 系）。这里用现有令牌派生，
   * 不写死十六进制 —— 亮/暗主题切换时它们会跟着令牌走。合成后的落点（括号里是设计稿实测）：
   *   副标题 / 歌单名 (78,86,101)（设计 (72,85,105)）
   *   药丸标签与歌曲行小图标 (62,70,87)（设计 (52,70,95)、(47,67,91)）
   *   歌手名 (133,145,163)（设计 (134,146,167) —— 比 --text-2 还浅一档，是设计稿里最淡的一层）
   */
  --dp-ink-soft: color-mix(in srgb, var(--text-1) 75%, transparent);
  --dp-ink-chip: color-mix(in srgb, var(--text-1) 82%, transparent);
  --dp-ink-meta: color-mix(in srgb, var(--text-2) 78%, transparent);
}

/*
 * base.css 只重置了 button 的边框与 UA 底色，UA 的 padding: 1px 6px 还在：
 * 区块标题被撑到 26 高、歌单封面横向缩 12（192 → 180）、歌曲行三列各自内缩 6。
 * 这里统一清掉，需要内边距的按钮（药丸、下拉菜单）在自己的规则里重新给。
 */
.discover-view :where(button) {
  padding: 0;
}

/* ------------------------------ 头图 ------------------------------ */

/* 左列 583 + 间距 5 + 照片 697，用 fr 让窄窗口按同一比例收缩 */
.dp-hero {
  display: grid;
  grid-template-columns: minmax(0, 583fr) minmax(0, 697fr);
  column-gap: 5px;
}

/* 头图左列的三段间距：19 + 行高 50 + 13 + 24 + 21 = 127，
   正好让六枚药丸的上边缘落在照片顶 +127 处（设计稿 99 → 226）。 */
.dp-hero-copy {
  padding-top: 19px;
}

.dp-hero-copy h1 {
  color: var(--text-1);
  font-size: 42px;
  font-weight: 600;
  line-height: 50px;
  letter-spacing: -0.02em;
}

.dp-hero-copy p {
  margin-top: 13px;
  /* 设计稿 20px 副标题实测 (72,85,105)，比 --text-2 (101,116,139) 深一档 */
  color: var(--dp-ink-soft);
  font-size: 20px;
  line-height: 24px;
}

.dp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 21px;
}

/* 药丸 88×40 = 左内边距 16 + 图标 20 + 间距 8 + 两字标签 28 + 右内边距 16 */
.dp-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px;
  border-radius: var(--r-pill);
  color: var(--dp-ink-chip);
  background: var(--surface-soft);
  font-size: 14px;
  line-height: 1;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.dp-chip:hover {
  color: var(--text-1);
  background: var(--surface-soft-hover);
}
/* 主动态只靠粉色填充 + 红色图标表达：设计稿里主动与非主动的文字是同一个深灰
   （实测 (52,57,86) 与 (52,70,95)，差异来自底下填充色不同而非字色不同） */
.dp-chip.is-active {
  color: var(--dp-ink-chip);
  background: var(--brand-soft);
}
.dp-chip.is-active :deep(.app-icon) {
  color: var(--brand);
}

.dp-hero-photo {
  position: relative;
  /* 用比例而不是固定高度：宽屏下照片不会被拉扁 */
  aspect-ratio: 697 / 202;
  border-radius: var(--r-sm);
}

/*
 * CoverArt 自带 width:100%/aspect-ratio:1，且它的 scoped 样式在 main.css 之后注入 ——
 * 同特异性下加载顺序不可靠，所以这里必须用 :deep() 把特异性提到 (0,3,0)。
 * 容器不设 overflow:hidden：72px 的 ⋯ 与下拉菜单都要能露到照片外，圆角由封面自己裁。
 */
.dp-hero-photo :deep(.cover-art) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  border-radius: inherit;
  box-shadow: none;
}

/* 引语压在照片左侧、垂直居中；照片本身是亮的（设计稿没有遮罩），所以只用一层投影保证可读 */
.dp-quote {
  position: absolute;
  /* 设计稿三行亮墨带（换算到本页坐标）落在 126/172/225，整块比居中高 2px */
  top: calc(50% - 2px);
  left: 20.6%;
  transform: translateY(-50%);
  color: #fff;
  text-shadow: 0 2px 14px rgba(10, 14, 22, 0.5);
}
.dp-quote span {
  display: block;
  font-size: 30px;
  font-weight: 600;
  line-height: 45px;
}
.dp-quote small {
  display: block;
  /* 设计稿两行大字的墨顶相距 46px、大字到 tagline 的墨顶相距 53px */
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 14px;
  line-height: 20px;
}

.dp-hero-more {
  position: absolute;
  /* 按钮与图标同为 72px：图标一旦比按钮大，Chrome 会把网格项夹成 start 对齐，点群整体右移 */
  top: -12px;
  right: 23px;
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  color: #fff;
  filter: drop-shadow(0 2px 10px rgba(10, 14, 22, 0.45));
}

.dp-hero-play {
  position: absolute;
  /* 清掉 button 的 UA padding 后内容右移了 6px，这里补回，保持圆钮距照片右缘 31px */
  right: 31px;
  bottom: 23px;
  display: inline-flex;
  align-items: center;
  gap: 11px;
  color: #fff;
  font-size: 14px;
  text-shadow: 0 1px 8px rgba(10, 14, 22, 0.45);
}
.dp-hero-play-dot {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  color: var(--brand);
  transition: background var(--dur-1) ease;
}
.dp-hero-play:hover .dp-hero-play-dot {
  background: #fff;
}
/* AppIcon 根节点自带 fill="none"，实心三角要在这里把填充打开 */
.dp-hero-play-dot :deep(.app-icon) {
  fill: currentColor;
  stroke: none;
}

.dp-menu {
  position: absolute;
  z-index: 3;
  top: 46px;
  right: 20px;
  min-width: 168px;
  padding: 6px;
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
}
.dp-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border-radius: var(--r-sm);
  color: var(--text-1);
  font-size: 14px;
  text-align: left;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.dp-menu button:hover {
  color: var(--brand);
  background: var(--surface-hover);
}

.dp-pop-enter-active,
.dp-pop-leave-active {
  transition:
    opacity var(--dur-1) ease,
    transform var(--dur-1) ease;
}
.dp-pop-enter-from,
.dp-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ------------------------------ 区块标题 ------------------------------ */

.dp-block {
  margin-top: 12px;
}
/* 设计稿的区块间距并不均匀：第二块 17、末块 34（末块与歌曲列表之间要留出呼吸） */
.dp-block + .dp-block {
  margin-top: 17px;
}
/* 特异性与上一条相同，靠书写顺序取胜 —— 不用 !important */
.dp-block.dp-block--last {
  margin-top: 34px;
}

.dp-sec-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.dp-sec-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
  font-size: 18px;
  font-weight: 600;
  line-height: 24px;
  transition: color var(--dur-1) ease;
}
.dp-sec-title:hover {
  color: var(--brand);
}

.dp-pager {
  display: inline-flex;
  align-items: center;
  gap: 15px;
  margin-left: auto;
  color: var(--text-2);
}
.dp-pager button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: inherit;
  transition: color var(--dur-1) ease;
}
.dp-pager button:hover:not(:disabled) {
  color: var(--brand);
}
.dp-pager button:disabled {
  color: var(--text-3);
  cursor: default;
  opacity: 0.5;
}

.dp-more-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--text-2);
  font-size: 16px;
  /* 16px 默认行高 24.8 会把「更多」这一行撑高，令区块标题整体上浮 0.4px 以上 */
  line-height: 24px;
  transition: color var(--dur-1) ease;
}
.dp-more-link:hover {
  color: var(--brand);
}

/* ------------------------------ 为你推荐 ------------------------------ */

/* 243/1284 与 13/1284 —— 写成百分比而不是 1fr，才能复现设计稿右侧那 17px 留白。
   设计稿五张卡的起点 pitch 恰是 256 = 243 + 13；gap 取 1.09%（14px）会让每张右移 1px、
   末张累积右移 4px。 */
.dp-picks {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 18.925%));
  column-gap: 1.0125%;
}

.dp-pick {
  position: relative;
  aspect-ratio: 243 / 157;
  border-radius: var(--r-sm);
  overflow: hidden;
  cursor: pointer;
  transition:
    transform var(--dur-2) var(--ease),
    box-shadow var(--dur-2) var(--ease);
}
.dp-pick:hover,
.dp-pick:focus-visible {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
}
.dp-pick :deep(.cover-art) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  border-radius: inherit;
  box-shadow: none;
}
.dp-pick-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(12, 16, 24, 0) 42%, rgba(12, 16, 24, 0.74) 100%);
}
.dp-pick-copy {
  position: absolute;
  right: 56px;
  bottom: 12px;
  left: 16px;
  display: flex;
  flex-direction: column;
  color: #fff;
}
.dp-pick-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 24px;
}
.dp-pick-sub {
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  line-height: 18px;
}
.dp-pick-play {
  position: absolute;
  right: 10px;
  bottom: 11px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  color: var(--text-1);
  transition: background var(--dur-1) ease;
}
.dp-pick:hover .dp-pick-play {
  background: #fff;
}
.dp-pick-play :deep(.app-icon) {
  fill: currentColor;
  stroke: none;
}

/* ------------------------------ 热门歌单 ------------------------------ */

/* 192/1284 与 16/1284；间距也用百分比，窄窗口下整体等比缩小且不会横向溢出 */
.dp-playlists {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 14.95%));
  column-gap: 1.25%;
}

.dp-playlist {
  display: block;
  width: 100%;
  color: var(--text-1);
  text-align: left;
  transition:
    transform var(--dur-2) var(--ease),
    box-shadow var(--dur-2) var(--ease);
}
.dp-playlist:hover,
.dp-playlist:focus-visible {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
}
.dp-playlist-cover {
  position: relative;
  display: block;
  aspect-ratio: 192 / 128;
  border-radius: var(--r-sm);
  overflow: hidden;
}
.dp-playlist-cover :deep(.cover-art) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  border-radius: inherit;
  box-shadow: none;
}
/* 白字 + 投影，没有底板 —— 徽标直接压在封面上 */
.dp-playlist-badge {
  position: absolute;
  top: 9px;
  left: 9px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  text-shadow: 0 1px 6px rgba(10, 14, 22, 0.55);
}
.dp-playlist-badge em {
  font-style: normal;
}
.dp-playlist-title {
  display: -webkit-box;
  height: 48px;
  margin-top: 6px;
  overflow: hidden;
  /* 设计稿歌单名实测 (73,86,111)，与副标题同一档 */
  color: var(--dp-ink-soft);
  font-size: 16px;
  line-height: 24px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* ------------------------------ 最新音乐 ------------------------------ */

/* 636/1284 与 621/1284 两列，列距 27/1284 */
.dp-songs {
  display: grid;
  grid-template-columns: 49.53% 48.36%;
  column-gap: 2.1%;
  /* 设计稿里第二行封面在播放条顶边之前完全不可见，故行距必然 ≥19px；取 10 + 行内上下各 5 = 20 */
  row-gap: 10px;
}

.dp-song {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr) auto;
  /* 设计稿封面右缘 338、标题墨迹 353 —— 列距 14 而不是 12 */
  column-gap: 14px;
  align-items: center;
  /* 行高 70 = 内容 60 + 上下各 5：上下内边距用于让封面居中，同时把首行封面压到设计稿位置
     （设计稿歌曲首行封面顶距区块标题墨顶 38px，前两块是 33px），hover 底色也因此比封面高 10px */
  height: 70px;
  /* 内边距而不是外边距：hover 底色仍然铺满整列（对标设计稿动作区右侧的 47px 留白） */
  padding: 5px 47px 5px 0;
  border-radius: var(--r-sm);
  text-align: left;
  transition: background var(--dur-1) ease;
}
.dp-song:hover {
  background: var(--surface-hover);
}
.dp-song.current {
  background: var(--brand-soft);
}
.dp-song :deep(.cover-art) {
  width: 60px;
  height: 60px;
  aspect-ratio: auto;
  border-radius: var(--r-sm);
}
.dp-song-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}
.dp-song-title {
  overflow: hidden;
  color: var(--text-1);
  font-size: 16px;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dp-song-artist {
  overflow: hidden;
  color: var(--dp-ink-meta);
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dp-song-actions {
  display: inline-flex;
  align-items: center;
  gap: 32px;
}
/* 设计稿这一行的三档灰是「歌名最深 → 时长居中 → 歌手最淡」，时长正好落在 --text-2 上 */
.dp-song-time {
  color: var(--text-2);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.dp-song-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--dp-ink-chip);
  cursor: pointer;
  transition: color var(--dur-1) ease;
}
.dp-song-icon:hover {
  color: var(--text-1);
}
.dp-song-icon.liked {
  color: var(--brand);
}
.dp-song-icon.liked :deep(.app-icon) {
  fill: currentColor;
}

.dp-hint {
  padding: 18px 0;
  color: var(--text-3);
  font-size: 14px;
}

/* 窄窗口下双列会把标题挤没，退回单列 */
@media (max-width: 1180px) {
  .dp-songs {
    grid-template-columns: minmax(0, 1fr);
  }
  .dp-song {
    padding-right: 12px;
  }
}
</style>

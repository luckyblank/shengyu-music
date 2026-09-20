<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import SectionHeading from '../music/SectionHeading.vue'
import { photoCover } from '../../data/catalog'
import headArt from '../../assets/radio/head-art.png'
import heroArt from '../../assets/radio/hero-art.jpg'
import sectionMark from '../../assets/radio/section-mark.png'
import weeklyBanner from '../../assets/radio/weekly-banner.jpg'
import {
  PRIMARY_SCENE_COUNT,
  RADIO_SCENES,
  buildSchedule,
  cycleCover,
  resolveSceneChannels,
  topHosts,
  weeklyPick
} from '../../data/radio-scenes'
import * as player from '../../stores/player'
import * as radio from '../../stores/radio'
import * as ui from '../../stores/ui'
import { formatCount, formatListeners } from '../../utils/format'
import type { RadioChannel } from '@shared/ipc'
import type { CoverSpec } from '../../types/music'
import type { RadioScene } from '../../data/radio-scenes'

/**
 * 电台 —— 声音频道，不是图片卡片墙。
 *
 * 频道数据来自 SomaFM 的公开目录，46 个频道全部带**实时在线人数**与一句简介。
 * 人数是真实量级（几十到几百），不做「12.4 万」这种美化 —— 拿不到就不编。
 * 分类直接采用 SomaFM 自己的流派归类，不另造维度。
 *
 * 页面按设计稿重排成「主栏 + 右栏」：主栏是频道墙与场景，右栏是节目单/推荐/主播。
 * 三处设计稿里没有真实数据支撑的地方做了替换，都记在下面各自的注释里。
 */

const activeGroup = ref<string>('全部')
/** 区块的「查看更多」：就地展开，不为它们新开页面 */
const allLive = ref(false)
const allScenes = ref(false)
const scheduleCount = ref(5)
const hostCount = ref(3)

const groups = computed(() => radio.radioGroups.value)

const byListeners = (a: RadioChannel, b: RadioChannel): number => b.listeners - a.listeners

const filteredChannels = computed(() =>
  activeGroup.value === '全部'
    ? radio.radioChannels.value
    : radio.radioChannels.value.filter((channel) => channel.genre === activeGroup.value)
)

/** 正在直播：默认只露前 4 个（设计稿是一行 4 张），展开后给该分类的全部 */
const liveList = computed(() => {
  const sorted = [...filteredChannels.value].sort(byListeners)
  return allLive.value ? sorted : sorted.slice(0, 4)
})

const liveNote = computed(() =>
  activeGroup.value === '全部'
    ? '让世界的声音，陪伴你此刻'
    : `${activeGroup.value} · ${filteredChannels.value.length} 个频道`
)

/** Hero 播「此刻在线最多」的频道 —— 它是最能出声的那一个 */
const heroChannel = computed(() => [...radio.radioChannels.value].sort(byListeners)[0] ?? null)

/** 每个场景的队列提前算好：点开就有声音，不比频道墙多一步 */
const sceneQueues = computed(() =>
  RADIO_SCENES.map((scene) => resolveSceneChannels(scene, radio.radioChannels.value))
)

const scenes = computed(() =>
  allScenes.value ? RADIO_SCENES : RADIO_SCENES.slice(0, PRIMARY_SCENE_COUNT)
)

const schedule = computed(() => buildSchedule(radio.radioChannels.value, scheduleCount.value))

// 避开已经在「正在直播」里露脸的频道，右栏不重复主栏内容
const weekly = computed(() =>
  weeklyPick(
    radio.radioChannels.value,
    liveList.value.map((channel) => channel.id)
  )
)

const hosts = computed(() =>
  topHosts(radio.radioChannels.value, hostCount.value, ui.followedHosts.value)
)

/** 频道没有官方图时才用内置照片兜底，序号保证每张卡不是同一张 */
const cover = (channel: RadioChannel, index = 0): CoverSpec =>
  channel.coverUrl ? { kind: 'url', url: channel.coverUrl } : photoCover(cycleCover(index))

const isCurrent = (channelId: string): boolean =>
  player.currentId.value === channelId && player.queueLabel.value === 'radio'

const isPlaying = (channelId: string): boolean => isCurrent(channelId) && player.isPlaying.value

const play = (channelId: string): void => {
  const index = radio.radioChannels.value.findIndex((item) => item.id === channelId)
  if (index < 0) return
  void player.playTracks(radio.radioChannels.value.map(radio.radioChannelToTrack), 'radio', index)
}

/** 正在播的就是它时按钮切成暂停 —— 与播放条的行为保持一致 */
const toggle = (channelId: string): void => {
  if (isCurrent(channelId)) {
    void player.toggle()
    return
  }
  play(channelId)
}

const playHero = (): void => {
  if (heroChannel.value) toggle(heroChannel.value.id)
}

const playScene = (scene: RadioScene): void => {
  const index = RADIO_SCENES.findIndex((item) => item.id === scene.id)
  const queue = sceneQueues.value[index] ?? []
  if (!queue.length) {
    ui.toast('这个场景暂时没有可用频道', 'warning')
    return
  }
  // 队列只放这个场景的频道，进队列后切歌仍在同一氛围里
  void player.playTracks(queue.map(radio.radioChannelToTrack), 'radio', 0)
}

const selectGroup = (name: string): void => {
  activeGroup.value = name
  // 带着「展开」态换分类等于一次几十张卡的突袭，先收回 4 个
  allLive.value = false
}

const toggleSchedule = (): void => {
  scheduleCount.value = scheduleCount.value === 5 ? 8 : 5
}

const toggleHosts = (): void => {
  hostCount.value = hostCount.value === 3 ? 6 : 3
}

onMounted(() => void radio.loadRadioChannels())
</script>

<template>
  <section class="page-view">
    <div class="radio-layout">
      <div class="radio-main">
        <header class="page-head">
          <div class="head-line">
            <h1>电台</h1>
            <!-- 设计稿里副标题与标题同基线并排，不是压在标题下方 -->
            <p class="head-sub">46 路 SomaFM 公播频道，点开即听</p>
          </div>
          <!-- 头部插画用的是设计稿自己的像素：浅粉装饰图，不做图标替代 -->
          <img class="head-art" :src="headArt" alt="" aria-hidden="true" />
          <div v-if="radio.radioTotalListeners.value" class="head-stat">
            <!-- formatListeners 自带的整句已含「人正在收听」，这里不能再补一遍单位 -->
            <strong>{{ formatListeners(radio.radioTotalListeners.value) }}</strong>
            <small>全部频道在线合计</small>
          </div>
        </header>

        <div v-if="radio.radioLoading.value && !groups.length" class="state">
          <span class="spinner"></span>正在获取频道目录…
        </div>

        <div v-else-if="radio.radioError.value" class="state error">
          <p>{{ radio.radioError.value }}</p>
          <button class="btn ghost" @click="radio.loadRadioChannels(true)">重试</button>
        </div>

        <template v-else>
          <div class="chips">
            <button :class="{ active: activeGroup === '全部' }" @click="selectGroup('全部')">
              全部 <small>{{ radio.radioChannels.value.length }}</small>
            </button>
            <button
              v-for="group in groups"
              :key="group.name"
              :class="{ active: activeGroup === group.name }"
              @click="selectGroup(group.name)"
            >
              {{ group.name }} <small>{{ group.channels.length }}</small>
            </button>
          </div>

          <!-- Hero：整块可点，主按钮直接播此刻在线最多的频道 -->
          <article v-if="heroChannel" class="hero" role="button" @click="playHero">
            <!-- 设计稿的 Hero 是一张实拍照片（右侧暖光 + 左侧深色），
                 这里直接铺裁自设计稿的图片，再叠一层渐变保证左侧文字可读 -->
            <img class="hero-art" :src="heroArt" alt="" aria-hidden="true" />
            <span class="hero-scrim" aria-hidden="true"></span>
            <div class="hero-copy">
              <h2>今夜适合听的电台</h2>
              <p class="hero-lead">让音乐陪伴你的每一个此刻</p>
              <p class="hero-sub">从氛围到电子，从城市到自然，总有一个声音懂你</p>
              <button type="button" class="hero-cta" @click.stop="playHero">
                <AppIcon name="play" :size="13" :stroke-width="2.2" />
                立即收听
              </button>
            </div>
          </article>

          <section class="block">
            <SectionHeading
              title="正在直播"
              :note="liveNote"
              :action="allLive ? '收起' : '查看更多'"
              @action="allLive = !allLive"
            >
              <template #mark>
                <img class="section-mark" :src="sectionMark" alt="" aria-hidden="true" />
              </template>
            </SectionHeading>
            <div class="live-grid">
              <article
                v-for="(channel, index) in liveList"
                :key="channel.id"
                class="live-card"
                :class="{ playing: isCurrent(channel.id) }"
                role="button"
                :aria-label="`播放 ${channel.title}`"
                @click="toggle(channel.id)"
              >
                <div class="live-cover">
                  <CoverArt :cover="cover(channel, index)" />
                  <span class="live-flag">直播中</span>
                  <span class="live-count">
                    <AppIcon name="volume" :size="12" />
                    {{ formatCount(channel.listeners) }}
                  </span>
                  <button
                    type="button"
                    class="cover-play"
                    :aria-label="`播放 ${channel.title}`"
                    @click.stop="toggle(channel.id)"
                  >
                    <AppIcon
                      :name="isPlaying(channel.id) ? 'pause' : 'play'"
                      :size="15"
                      :stroke-width="2.2"
                    />
                  </button>
                </div>
                <h3 class="live-title">{{ channel.title }}</h3>
                <p class="live-desc">{{ channel.description || 'SomaFM 公播频道' }}</p>
                <div class="tag-row">
                  <span v-for="tag in channel.genres.slice(0, 3)" :key="tag">{{ tag }}</span>
                </div>
              </article>
            </div>
          </section>

          <section class="block">
            <SectionHeading
              title="场景电台"
              note="在不同的时刻，遇见不同的风景"
              :action="allScenes ? '收起' : '查看更多'"
              @action="allScenes = !allScenes"
            >
              <template #mark>
                <img class="section-mark" :src="sectionMark" alt="" aria-hidden="true" />
              </template>
            </SectionHeading>
            <div class="scene-grid">
              <article
                v-for="scene in scenes"
                :key="scene.id"
                class="scene-tile"
                role="button"
                :aria-label="`播放${scene.title}`"
                @click="playScene(scene)"
              >
                <CoverArt :cover="photoCover(scene.cover)" />
                <span class="scene-scrim" aria-hidden="true"></span>
                <div class="scene-copy">
                  <h3>{{ scene.title }}</h3>
                  <p>{{ scene.subtitle }}</p>
                </div>
                <button
                  type="button"
                  class="scene-play"
                  :aria-label="`播放${scene.title}`"
                  @click.stop="playScene(scene)"
                >
                  <AppIcon name="play" :size="12" :stroke-width="2.2" />
                </button>
              </article>
            </div>
          </section>
        </template>
      </div>

      <aside v-if="!radio.radioError.value" class="radio-side">
        <section>
          <SectionHeading
            size="sm"
            title="今日节目单"
            :action="scheduleCount === 5 ? '更多' : '收起'"
            @action="toggleSchedule"
          />
          <div class="schedule">
            <button
              v-for="entry in schedule"
              :key="`${entry.label}-${entry.channel.id}`"
              type="button"
              class="schedule-row"
              :class="{ live: entry.live, now: entry.now }"
              @click="toggle(entry.channel.id)"
            >
              <span class="schedule-time">{{ entry.label }}</span>
              <span class="schedule-dot" aria-hidden="true"></span>
              <span class="schedule-copy">
                <strong>{{ entry.channel.title }}</strong>
                <small>{{ entry.tagline }}</small>
              </span>
              <span v-if="entry.live" class="schedule-live">正在直播</span>
            </button>
          </div>
        </section>

        <section>
          <!-- 设计稿这里是整块横向图（图上自带「本周推荐／探索更多精彩电台」与花饰），
               不是自绘的文字卡片 —— 所以不加 SectionHeading，也不拼元素替代它 -->
          <article
            v-if="weekly"
            class="weekly-banner"
            role="button"
            :aria-label="`播放 ${weekly.title}`"
            @click="toggle(weekly.id)"
          >
            <img :src="weeklyBanner" alt="" />
          </article>
        </section>

        <section>
          <SectionHeading
            size="sm"
            title="热门主播"
            :action="hostCount === 3 ? '更多' : '收起'"
            @action="toggleHosts"
          />
          <div class="host-list">
            <div v-for="(host, index) in hosts" :key="host.name" class="host-row">
              <span class="host-avatar">
                <CoverArt
                  :cover="
                    host.avatar ? { kind: 'url', url: host.avatar } : photoCover(cycleCover(index))
                  "
                  size="tiny"
                />
              </span>
              <span class="host-copy">
                <strong>{{ host.name }}</strong>
                <small
                  >{{ host.channels.length }} 个频道 ·
                  {{ formatCount(host.listeners) }} 人在听</small
                >
              </span>
              <button
                type="button"
                class="host-follow"
                :class="{ on: ui.followedHosts.value.includes(host.name) }"
                @click="ui.toggleFollowHost(host.name)"
              >
                <AppIcon
                  :name="ui.followedHosts.value.includes(host.name) ? 'check' : 'plus'"
                  :size="9"
                  :stroke-width="2.2"
                />
                {{ ui.followedHosts.value.includes(host.name) ? '已关注' : '关注' }}
              </button>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
/* 设计稿这一页的内边距比全局 .page-view 的 44px 窄得多（右侧实测约 19px），
   不覆盖的话整页会往中间缩，右栏也跟着离开设计稿的位置 */
.page-view {
  padding: 8px 19px 32px;
}
.page-head {
  display: flex;
  gap: 13px;
  align-items: center;
  margin-bottom: 10px;
}
.head-line {
  display: flex;
  gap: 12px;
  align-items: baseline;
  min-width: 0;
}
.page-head h1 {
  color: var(--text-1);
  font-size: 33px;
  font-weight: 600;
  /* 设计稿里副标题紧贴标题字形，行高必须压到 1.05 才没有多余留白 */
  line-height: 1.05;
  letter-spacing: -0.02em;
}
.head-sub {
  min-width: 0;
  overflow: hidden;
  color: var(--text-2);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 头部浅粉装饰插画，宽度按设计稿量出的 94px，高度交给图片比例 */
.head-art {
  display: block;
  width: 94px;
  height: auto;
  margin-left: auto;
}
.head-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-end;
}
/* 设计稿的在线人数是实心粉底白字的药丸，不是粉色大字 */
.head-stat strong {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 9px;
  border-radius: var(--r-pill);
  color: var(--on-brand);
  background: var(--brand);
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
}
.head-stat small {
  color: var(--text-3);
  font-size: 8.5px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  /* 设计稿实测：药丸高 28px 左右分两行，行间距约 6px、列间距约 8px */
  gap: 6px 8px;
  margin-bottom: 13px;
}
/* 设计稿里未选中的药丸既没有边框也没有底色，只是一行文字 ——
   早期版本给它们套了描边和面板底色，正是「跟设计稿不一样」的来源 */
.chips button {
  display: inline-flex;
  gap: 9px;
  align-items: center;
  height: 28px;
  padding: 0 15px;
  border: 0;
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: transparent;
  font-size: 10px;
  cursor: pointer;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.chips button small {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 9px;
}
.chips button:hover {
  color: var(--text-1);
  background: var(--wash-2);
}
.chips button.active {
  color: var(--on-brand);
  background: var(--brand);
}
.chips button.active small {
  color: var(--on-brand);
  opacity: 0.75;
}

/* 主栏 + 右栏：设计稿里右栏与主栏同顶起始，所以 page-head 挪进了主栏内部 */
.radio-layout {
  display: grid;
  /* 设计稿实测：右栏满宽元素 236px 宽，主栏↔右栏间距 22px */
  grid-template-columns: minmax(0, 1fr) 236px;
  gap: 22px;
  align-items: start;
}
.radio-main {
  min-width: 0;
}
.radio-side {
  display: flex;
  flex-direction: column;
  gap: 30px;
  min-width: 0;
}
/* 设计稿右栏的文字整体比上面的横幅向内缩 12px（横幅是满宽的），
   缩进放在容器上，行内元素才能跟着一起对齐 */
.radio-side :deep(.section-heading),
.radio-side .schedule,
.radio-side .host-list {
  padding: 0 12px;
}
.block + .block {
  margin-top: 25px;
}
/* 下面这组把 SectionHeading 的共用字号改小：设计稿的区块标题远小于全局 24px。
   :deep 生成的选择器比组件自带的 .heading-sm h2 多一个类，能稳定压过去 */
.radio-main :deep(.section-heading),
.radio-side :deep(.section-heading) {
  margin-bottom: 10px;
}
.radio-main :deep(.heading-main),
.radio-side :deep(.heading-main) {
  gap: 9px;
}
.radio-main :deep(.section-heading h2),
.radio-side :deep(.section-heading h2) {
  font-size: 15px;
  line-height: 1.05;
}
.radio-main :deep(.heading-note),
.radio-side :deep(.heading-note) {
  font-size: 10.5px;
}
/* 设计稿里标题与说明之间是一个间隔点，不是空格 */
.radio-main :deep(.heading-note)::before,
.radio-side :deep(.heading-note)::before {
  content: '· ';
}
.radio-main :deep(.heading-action),
.radio-side :deep(.heading-action) {
  font-size: 10px;
}
/* 区块标题前的粉圆标记直接用设计稿自己的像素，不做 CSS 圆点替代 */
.section-mark {
  width: 19px;
  height: 19px;
  align-self: center;
}

.hero {
  position: relative;
  display: flex;
  align-items: center;
  /* 设计稿实测：Hero 高 162px、圆角 12px、文字左内边距 37px */
  min-height: 162px;
  padding: 0 0 0 37px;
  overflow: hidden;
  border-radius: 12px;
  /* 图片左侧要融进深色底，所以底色自己也得是那一段深色，不能是面板色 */
  background: linear-gradient(
    100deg,
    #04060a 0%,
    #0d1622 34%,
    #171320 60%,
    #2a1a12 82%,
    #3b2110 100%
  );
  box-shadow: var(--shadow-card);
  cursor: pointer;
}
/* 设计稿 Hero 右侧是一张实拍照片，左侧用遮罩淡出到上面的深色底 */
.hero-art {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 344px;
  height: 100%;
  object-fit: cover;
  object-position: left center;
  mask-image: linear-gradient(90deg, transparent 0%, #000 30%);
}
.hero-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(4, 6, 10, 0.9) 0%,
    rgba(4, 6, 10, 0.55) 42%,
    rgba(4, 6, 10, 0.12) 78%,
    rgba(4, 6, 10, 0) 100%
  );
}
.hero-copy {
  position: relative;
  z-index: 1;
  max-width: 430px;
  color: #fff;
}
.hero-copy h2 {
  font-size: 32px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.01em;
}
.hero-lead {
  margin-top: 7px;
  font-size: 14px;
  opacity: 0.92;
}
.hero-sub {
  margin-top: 5px;
  font-size: 11px;
  opacity: 0.7;
}
.hero-cta {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 33px;
  margin-top: 19px;
  padding: 0 22px;
  border-radius: var(--r-pill);
  color: var(--on-brand);
  background: var(--brand);
  font-size: 12.5px;
  font-weight: 500;
  transition: background var(--dur-1) ease;
}
.hero-cta:hover {
  background: var(--brand-hover);
}

.live-grid {
  display: grid;
  /* 设计稿这一行固定 4 张。auto-fill 在默认窗口会掉成 3 列，
     第 4 张卡被挤到第二行独自站着 —— 这正是「排版坏掉」的观感来源 */
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
/* 设计稿里频道卡是「裸」的：文字直接落在面板底色上，没有卡片底面和阴影 */
.live-card {
  min-width: 0;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: transform var(--dur-2) var(--ease);
}
.live-card:hover {
  transform: translateY(-2px);
}
.live-cover {
  position: relative;
}
/* 覆盖 CoverArt 的 1:1 —— 频道卡是横向图，设计稿实测 233×121 */
.live-cover .cover-art {
  width: 100%;
  aspect-ratio: 233 / 121;
}
.live-flag {
  position: absolute;
  top: 7px;
  left: 8px;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  color: var(--on-brand);
  background: var(--brand);
  font-size: 9px;
  font-weight: 500;
}
.live-count {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-flex;
  gap: 3px;
  align-items: center;
  padding: 2px 6px;
  border-radius: var(--r-pill);
  color: #fff;
  background: rgba(12, 16, 24, 0.55);
  font-family: var(--font-mono);
  font-size: 8.5px;
}
/* 常显播放键：设计稿里每张卡右下角一直有一个 */
.cover-play {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 23px;
  height: 23px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.24);
  backdrop-filter: blur(6px);
  transition:
    background var(--dur-1) ease,
    color var(--dur-1) ease;
}
.cover-play:hover {
  color: var(--brand);
  background: #fff;
}
.live-title {
  margin: 6px 0 0;
  overflow: hidden;
  color: var(--text-1);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.live-desc {
  display: -webkit-box;
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--text-2);
  font-size: 10.5px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 7px 0 0;
}
.tag-row span {
  padding: 3px 9px;
  border-radius: var(--r-xs);
  color: var(--text-3);
  background: var(--wash-2);
  font-size: 8.5px;
}

.scene-grid {
  display: grid;
  /* 设计稿这一行固定 6 张瓦片、瓦片间距 9px */
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 9px;
}
.scene-tile {
  position: relative;
  overflow: hidden;
  /* 设计稿实测瓦片 154×87 */
  aspect-ratio: 154 / 87;
  border-radius: var(--r-md);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: transform var(--dur-2) var(--ease);
}
.scene-tile:hover {
  transform: translateY(-2px);
}
.scene-tile .cover-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  border-radius: 0;
  box-shadow: none;
}
.scene-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(12, 16, 24, 0) 42%, rgba(12, 16, 24, 0.74) 100%);
}
.scene-copy {
  position: absolute;
  right: 10px;
  bottom: 8px;
  left: 10px;
  color: #fff;
}
.scene-copy h3 {
  font-size: 11px;
  font-weight: 500;
}
.scene-copy p {
  margin-top: 2px;
  padding-right: 22px;
  overflow: hidden;
  font-size: 8.5px;
  opacity: 0.8;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scene-play {
  position: absolute;
  right: 7px;
  bottom: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.24);
  transition: background var(--dur-1) ease;
}
.scene-play:hover {
  color: var(--brand);
  background: #fff;
}

.schedule {
  display: flex;
  flex-direction: column;
}
.schedule-row {
  display: grid;
  /* 设计稿：时间列 20px ｜ 圆点列 6px ｜ 标题+副标题 ｜ 右侧药丸
     （20px 而非 22px，是为了让圆点中心落在距行盒左沿 50px 处，与设计稿实测一致） */
  grid-template-columns: 20px 6px minmax(0, 1fr) auto;
  column-gap: 15px;
  align-items: center;
  width: 100%;
  /* 行内不要留内边距 —— 设计稿里时间文字紧贴行盒左沿（按钮的默认内边距会把它推偏 6px） */
  padding: 0;
  /* 设计稿行距 40px，行高交给内容撑开 */
  min-height: 40px;
  text-align: left;
  transition: background var(--dur-1) ease;
}
.schedule-row:hover {
  background: var(--wash-2);
}
.schedule-time {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 9.5px;
}
/* 圆点列：未到的是空心环，此刻的标记是实心粉点 —— 设计稿里两种标记并存 */
.schedule-dot {
  position: relative;
  box-sizing: border-box;
  width: 6px;
  height: 6px;
  /* 1.6px 是刻意的：Blink 会把边框宽度向下取整到整设备像素，DPR 1.25 下写 1.5px 只剩 1 设备像素，
     比设计稿约 1.6px 的描边细一圈 */
  border: 1.6px solid var(--divider);
  border-radius: 50%;
}
.schedule-row.now .schedule-dot {
  border: 0;
  background: var(--brand);
}
/* 竖线把各行的标记串成一条时间轴：从本行圆点中心连到下一行圆点中心（行距 40px）。
   设计稿最后一行没有向下的连线，所以末行不画 */
.schedule-row:not(:last-child) .schedule-dot::before {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1.6px;
  height: 40px;
  background: var(--divider);
  content: '';
  transform: translateX(-50%);
}
/* 粉点往下这一段是淡粉渐隐再转灰，对应设计稿里「本档还在播」的那一截 */
.schedule-row.now .schedule-dot::before {
  background: linear-gradient(var(--brand-soft), var(--divider));
}
.schedule-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.schedule-copy strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.schedule-copy small {
  overflow: hidden;
  color: var(--text-3);
  font-size: 9px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 设计稿里只有「正在直播」那一行有实心粉色药丸（约 55×21，白字 9px） */
.schedule-live {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  padding: 0 9px;
  border-radius: var(--r-pill);
  color: var(--on-brand);
  background: var(--brand);
  font-size: 9px;
  white-space: nowrap;
}

/* 本周推荐：设计稿是整块横幅图，图上自带文案与花饰 */
.weekly-banner {
  position: relative;
  overflow: hidden;
  aspect-ratio: 302 / 109;
  border-radius: var(--r-md);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: transform var(--dur-2) var(--ease);
}
.weekly-banner:hover {
  transform: translateY(-2px);
}
.weekly-banner img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.host-list {
  display: flex;
  flex-direction: column;
}
.host-row {
  display: grid;
  /* 设计稿实测：头像 37px、行距 51.5px（用 min-height 固定节奏） */
  grid-template-columns: 37px minmax(0, 1fr) auto;
  column-gap: 11px;
  align-items: center;
  min-height: 51px;
}
.host-avatar .cover-art {
  width: 37px;
  height: 37px;
  border-radius: 50%;
}
.host-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.host-copy strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 11.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.host-copy small {
  margin-top: 1px;
  overflow: hidden;
  color: var(--text-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 设计稿实测：纯白圆角按钮，粉色文字，没有实心粉底也没有粉边框 */
.host-follow {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--divider);
  border-radius: var(--r-pill);
  color: var(--brand);
  background: var(--surface);
  font-size: 9.5px;
  white-space: nowrap;
  transition:
    color var(--dur-1) ease,
    border-color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.host-follow:hover {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.host-follow.on {
  color: var(--text-2);
  border-color: var(--divider);
  background: var(--wash-2);
}

/* 设计稿的场景区固定 6 列；原先的 1280px 断点会掉成 4 列，而默认窗口正好落在这个区间 */
@media (max-width: 1180px) {
  .radio-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 30px;
  }
}
@media (max-width: 900px) {
  .scene-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .hero {
    padding: 24px;
  }
  /* 窄窗口下 Hero 的文字区会压到右图，先收起装饰图 */
  .hero-art {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .live-card,
  .scene-tile,
  .weekly-banner {
    transition: none;
  }
  .live-card:hover,
  .scene-tile:hover,
  .weekly-banner:hover {
    transform: none;
  }
}

.state {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 70px 0;
  color: var(--text-3);
  font-size: 13px;
}
.state.error {
  flex-direction: column;
  color: var(--text-2);
}
.btn.ghost {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 16px;
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  color: var(--text-1);
  background: var(--surface);
  font-size: 14px;
}
.btn.ghost:hover {
  background: var(--surface-soft);
}
</style>

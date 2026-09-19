<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, type Component } from 'vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppTopbar from './components/layout/AppTopbar.vue'
import AppDropOverlay from './components/layout/AppDropOverlay.vue'
import PlayerBar from './components/PlayerBar.vue'
import QueuePanel from './components/QueuePanel.vue'
import LyricsPanel from './components/LyricsPanel.vue'
import NowPlayingView from './components/NowPlayingView.vue'
import EqualizerPanel from './components/EqualizerPanel.vue'
import MvView from './components/MvView.vue'
import SearchOverlay from './components/search/SearchOverlay.vue'
import ToastStack from './components/ToastStack.vue'
import PromptDialog from './components/PromptDialog.vue'

import DiscoverView from './components/pages/DiscoverView.vue'
import SearchView from './components/pages/SearchView.vue'
import RadioView from './components/pages/RadioView.vue'
import ChartsView from './components/pages/ChartsView.vue'
import DailyView from './components/pages/DailyView.vue'
import ArtistView from './components/pages/ArtistView.vue'
import ReportView from './components/pages/ReportView.vue'
import LibraryView from './components/pages/LibraryView.vue'
import FavoritesView from './components/pages/FavoritesView.vue'
import RecentView from './components/pages/RecentView.vue'
import PlaylistView from './components/pages/PlaylistView.vue'
import SettingsView from './components/pages/SettingsView.vue'

import { useFileDrop } from './composables/useFileDrop'
import { useGlobalShortcuts } from './composables/useGlobalShortcuts'
import { hydrateLibrary, toggleLike, validateLocalFiles } from './stores/library'
import * as online from './stores/online'
import * as player from './stores/player'
import * as ui from './stores/ui'
import { startLyricTracker } from './services/lyrics-tracker'
import type { AppPage } from './types/music'

/**
 * 应用外壳：只负责骨架、启动流程与浮层挂载。
 * 页面内容在 components/pages/，布局部件在 components/layout/。
 *
 * 页面调度用组件映射而不是 v-if/v-else 链：
 * 原来的写法里 settings 是链尾的 v-else，任何守卫不成立的页面（比如没选歌手就进 artist）
 * 都会**静默渲染成设置页**。改成映射后，守卫由各页面自己给空态，问题从结构上消失。
 */

const PAGES: Record<AppPage, Component> = {
  discover: DiscoverView,
  search: SearchView,
  radio: RadioView,
  charts: ChartsView,
  daily: DailyView,
  artist: ArtistView,
  report: ReportView,
  library: LibraryView,
  favorites: FavoritesView,
  recent: RecentView,
  playlist: PlaylistView,
  settings: SettingsView
}

const { dragDepth } = useFileDrop()
useGlobalShortcuts()

/* ------------------------------ 启动 ------------------------------ */

onMounted(async () => {
  // 所有浮层均为用户触发型 UI；启动 / 热更新时始终从关闭状态开始
  ui.closeAllPanels()

  // 顺序不可动：曲库先就位，播放器才能按 id 解析出上次的曲目
  await hydrateLibrary()
  await validateLocalFiles()

  const state = await window.shengyu.loadState()
  await ui.hydrateUi({
    equalizer: state.equalizer,
    theme: state.settings.theme ?? 'light',
    fx: state.settings.fx ?? 'none',
    lyricsColor: state.settings.lyricsColor ?? '#172033',
    searchHistory: state.settings.searchHistory ?? [],
    followedHosts: state.settings.followedHosts ?? []
  })
  await player.hydratePlayer({
    trackId: state.playback.trackId,
    position: state.playback.position,
    volume: state.playback.volume,
    muted: state.playback.muted,
    shuffled: state.playback.shuffled,
    repeat: state.playback.repeat,
    queue: state.playback.queue,
    queueLabel: state.playback.queueLabel,
    restoreOnLaunch: state.settings.restoreOnLaunch
  })
  player.bindRemoteCommands()
  startLyricTracker()

  // 托盘与媒体键的「收藏」指令落在当前曲目上
  window.player!.toggleLike = () => {
    if (player.currentId.value) toggleLike(player.currentId.value)
  }
})

onBeforeUnmount(() => {
  player.disposePlayer()
})

/**
 * 在线榜单按需拉取。
 * immediate 是必须的：启动时 activePage 本来就是 discover、不会发生变化，
 * 普通 watch 不会触发，榜单会一直空着。
 */
watch(
  ui.activePage,
  (page) => {
    if (page === 'charts' || page === 'discover') void online.loadChart()
  },
  { immediate: true }
)
</script>

<template>
  <div class="music-app" :class="{ 'is-dragging': dragDepth > 0 }">
    <AppSidebar />

    <main class="content-shell">
      <AppTopbar />
      <div class="scroll-content">
        <component :is="PAGES[ui.activePage.value]" :key="ui.activePage.value" />
      </div>
    </main>

    <PlayerBar />

    <EqualizerPanel v-if="ui.equalizerOpen.value" />
    <Transition name="panel">
      <QueuePanel v-if="ui.queueOpen.value" @close="ui.closePanel('queue')" />
    </Transition>
    <Transition name="panel">
      <LyricsPanel v-if="ui.lyricsOpen.value" @close="ui.closePanel('lyrics')" />
    </Transition>
    <div
      v-if="ui.queueOpen.value || ui.lyricsOpen.value"
      class="panel-scrim"
      @click="ui.closeAllPanels()"
    ></div>

    <NowPlayingView v-if="ui.nowPlayingOpen.value" />
    <MvView v-if="ui.mvOpen.value" />

    <SearchOverlay />

    <AppDropOverlay :visible="dragDepth > 0" />
    <ToastStack />
    <PromptDialog />
  </div>
</template>

<style>
/*
 * 外壳级样式留在全局：这几个选择器是布局骨架，不归属任何子组件。
 * 组件自身的样式一律写在各自 SFC 的 scoped 块里。
 */
.music-app {
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  width: 100%;
  height: 100%;
  padding-bottom: var(--player-h);
  overflow: hidden;
  background: var(--bg);
}
.content-shell {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: var(--header-h) minmax(0, 1fr);
}
.scroll-content {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

/* 页面容器：所有页面视图共用 */
.page-view {
  width: min(1320px, 100%);
  margin: 0 auto;
  padding: 32px var(--content-pad) 64px;
  animation: page-enter 320ms var(--ease);
}
@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 右侧抽屉的遮罩与过渡 */
.panel-scrim {
  position: fixed;
  z-index: 18;
  /* 从顶栏下方开始：搜索框是常驻入口，抽屉打开时点它应当直接进搜索，
     而不是被遮罩吃掉这一下点击（遮罩只负责收抽屉，不负责挡住顶栏） */
  inset: var(--header-h) 0 var(--player-h);
  background: rgba(12, 16, 24, 0.18);
}
.panel-enter-active,
.panel-leave-active {
  transition:
    transform 300ms var(--ease),
    opacity 200ms ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(28px);
}

@media (prefers-reduced-motion: reduce) {
  .page-view {
    animation: none;
  }
}
</style>

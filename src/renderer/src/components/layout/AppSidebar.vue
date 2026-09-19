<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { createPlaylist, importedTracks, playlists, likedIds } from '../../stores/library'
import * as ui from '../../stores/ui'
import type { AppPage } from '../../types/music'

/**
 * 左侧导航。
 *
 * 信息架构按设计稿重排：
 *  - 搜索不再是一级导航（它属于顶栏，随用随走）
 *  - 听歌报告降级到「工具」
 *  - 本地音乐归入「工具」，不再是「我的音乐」的主角
 *  - 歌单不再是导航项，而是「我的歌单」分组下的滚动列表
 */

interface NavItem {
  page: AppPage
  label: string
  icon: string
  /** 右侧计数，undefined 表示不显示 */
  count?: number
}

const likedCount = computed(() => likedIds.value.size)

const onlineNav = computed<NavItem[]>(() => [
  { page: 'discover', label: '发现音乐', icon: 'home' },
  { page: 'daily', label: '推荐', icon: 'spark' },
  { page: 'charts', label: '排行榜', icon: 'trophy' },
  { page: 'radio', label: '电台', icon: 'radio' }
])

const myNav = computed<NavItem[]>(() => [
  { page: 'favorites', label: '我喜欢', icon: 'heart', count: likedCount.value },
  { page: 'recent', label: '最近播放', icon: 'clock' }
])

const toolNav = computed<NavItem[]>(() => [
  { page: 'library', label: '本地音乐', icon: 'library', count: importedTracks.value.length },
  { page: 'report', label: '听歌报告', icon: 'equalizer' },
  { page: 'settings', label: '设置', icon: 'settings' }
])

const isActive = (page: AppPage): boolean => ui.activePage.value === page

/**
 * 「我的歌单」折叠态。
 * 纯视图状态，不进 settings：重启后一律展开，否则用户收起过一次就再也看不到歌单入口。
 */
const playlistsCollapsed = ref(false)

/**
 * 新建歌单。
 * 沿用仓库既有的 window.prompt 写法（与 renameCurrentPlaylist 保持一致）——
 * window.ui.ask 是确认框，拿不到用户输入。
 */
const createAndEdit = (): void => {
  const title = window.prompt('给你的新歌单起个名字', '新歌单')
  if (!title?.trim()) return
  ui.openPlaylist(createPlaylist(title.trim()).id)
}
</script>

<template>
  <aside class="sidebar">
    <button class="brand" aria-label="回到发现页" @click="ui.navigate('discover')">
      <span class="brand-mark"><AppIcon name="disc" :size="16" :stroke-width="2.2" /></span>
      <span class="brand-name">声屿音乐</span>
    </button>

    <nav class="nav-group" aria-label="在线音乐">
      <p class="nav-label">在线音乐</p>
      <button
        v-for="item in onlineNav"
        :key="item.page"
        :class="['nav-item', { active: isActive(item.page) }]"
        @click="ui.navigate(item.page)"
      >
        <AppIcon :name="item.icon" :size="18" /><span>{{ item.label }}</span>
      </button>
    </nav>

    <nav class="nav-group" aria-label="我的音乐">
      <p class="nav-label">我的音乐</p>
      <button
        v-for="item in myNav"
        :key="item.page"
        :class="['nav-item', { active: isActive(item.page) }]"
        @click="ui.navigate(item.page)"
      >
        <AppIcon :name="item.icon" :size="18" /><span>{{ item.label }}</span>
        <span v-if="item.count" class="nav-count">{{ item.count }}</span>
      </button>
    </nav>

    <div class="playlist-nav" :class="{ collapsed: playlistsCollapsed }">
      <div class="playlist-head">
        <button
          class="playlist-toggle"
          :aria-expanded="!playlistsCollapsed"
          aria-controls="sidebar-playlists"
          @click="playlistsCollapsed = !playlistsCollapsed"
        >
          <span class="playlist-label">我的歌单</span>
          <AppIcon class="toggle-chevron" name="chevron-down" :size="13" />
        </button>
        <button class="icon-button subtle" aria-label="新建歌单" @click="createAndEdit">
          <AppIcon name="plus" :size="15" />
        </button>
      </div>
      <div v-show="!playlistsCollapsed" id="sidebar-playlists" class="playlist-scroll">
        <button
          v-for="playlist in playlists"
          :key="playlist.id"
          :class="[
            'playlist-link',
            {
              active:
                ui.activePage.value === 'playlist' && ui.currentPlaylistId.value === playlist.id
            }
          ]"
          @click="ui.openPlaylist(playlist.id)"
        >
          <span class="playlist-title" :title="playlist.title">{{ playlist.title }}</span>
          <small>{{ playlist.trackIds.length }}</small>
        </button>
      </div>
    </div>

    <nav class="nav-group nav-tools" aria-label="工具">
      <p class="nav-label">工具</p>
      <button
        v-for="item in toolNav"
        :key="item.page"
        :class="['nav-item', { active: isActive(item.page) }]"
        @click="ui.navigate(item.page)"
      >
        <AppIcon :name="item.icon" :size="18" /><span>{{ item.label }}</span>
        <span v-if="item.count" class="nav-count">{{ item.count }}</span>
      </button>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 20px 12px 14px;
  border-right: 1px solid var(--divider);
  background: var(--surface);
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 0 8px 22px;
  background: transparent;
}
.brand-mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: var(--r-md);
  color: var(--on-brand);
  background: var(--brand);
}
.brand-name {
  color: var(--text-1);
  font-family: var(--font-display);
  font-size: 17px;
  letter-spacing: 0.04em;
}

.nav-group {
  flex: 0 0 auto;
  min-height: 0;
}
.nav-tools {
  /* 不钉底：工具组跟随上方内容排列，歌单折叠或很少时整体上移，剩余空白留在侧栏底部 */
  padding-top: 12px;
}
.nav-label {
  margin: 0 10px 6px;
  color: var(--text-3);
  font-size: 12px;
  letter-spacing: 0.06em;
}

.nav-item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  height: 38px;
  margin-bottom: 2px;
  padding: 0 10px;
  border-radius: var(--r-md);
  color: var(--text-2);
  background: transparent;
  text-align: left;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.nav-item > span:not(.nav-count) {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-item:hover {
  color: var(--text-1);
  background: var(--surface-soft);
}
/* 选中态：红色实底 + 反白，不用左侧竖条 */
.nav-item.active {
  color: var(--on-brand);
  background: var(--brand);
}
.nav-item.active:hover {
  background: var(--brand-hover);
}
.nav-count {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
}
.nav-item.active .nav-count {
  color: var(--on-brand);
  opacity: 0.8;
}

.playlist-nav {
  display: flex;
  min-height: 0;
  /* 只缩不长：歌单很少时不吞掉剩余高度（否则工具组被顶到底部），歌单超长时靠收缩换来滚动 */
  flex: 0 1 auto;
  flex-direction: column;
  margin-top: 12px;
}
.playlist-head {
  display: flex;
  gap: 2px;
  align-items: center;
  padding-right: 6px;
}
/* 标题行整体可点：文字与右侧箭头都触发折叠，+ 按钮仍是独立的新建入口 */
.playlist-toggle {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  margin-bottom: 6px;
  padding: 4px 10px;
  border-radius: var(--r-md);
  color: var(--text-3);
  background: transparent;
  text-align: left;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.playlist-toggle:hover {
  color: var(--text-2);
  background: var(--surface-soft);
}
.playlist-label {
  overflow: hidden;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toggle-chevron {
  flex: 0 0 auto;
  transition: transform var(--dur-1) ease;
}
/* 收起：箭头转向右侧，滚动容器让出高度，工具组贴着标题继续排在下方 */
.playlist-nav.collapsed {
  flex: 0 0 auto;
}
.playlist-nav.collapsed .toggle-chevron {
  transform: rotate(-90deg);
}
.playlist-scroll {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
}
.playlist-link {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  border-radius: var(--r-md);
  color: var(--text-2);
  background: transparent;
  text-align: left;
  transition: background var(--dur-1) ease;
}
.playlist-link:hover {
  background: var(--surface-soft);
}
.playlist-link.active {
  color: var(--brand);
  background: var(--brand-soft);
}
.playlist-title {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playlist-link small {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>

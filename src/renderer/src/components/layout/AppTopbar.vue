<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import WindowControls from '../WindowControls.vue'
import SearchInput from '../search/SearchInput.vue'
import { importedTracks } from '../../stores/library'
import * as ui from '../../stores/ui'
import avatarImage from '../../assets/avatar.jpg'

/**
 * 顶栏：历史导航 + 搜索 + 账户与窗口控制。
 *
 * 搜索框与它展开的内容都不在这里：输入框是 SearchInput，展开的浮层由 SearchOverlay
 * 整体 Teleport 到 body（顶栏的 backdrop-filter 会让它成为固定定位后代的包含块）。
 * 这里只留骨架、账户与窗口控制。
 */
</script>

<template>
  <header class="topbar">
    <div class="history-controls">
      <button
        class="round-control"
        :disabled="ui.history.value.length <= 1"
        aria-label="返回"
        @click="ui.goBack()"
      >
        <AppIcon name="chevron-left" :size="18" />
      </button>
      <button class="round-control" disabled aria-label="前进">
        <AppIcon name="chevron-right" :size="18" />
      </button>
    </div>

    <SearchInput />

    <div class="topbar-actions">
      <button class="account" @click="ui.navigate('settings')">
        <img class="avatar" :src="avatarImage" alt="" />
        <span class="account-copy">
          <strong>聆听者</strong>
          <small>{{
            importedTracks.length ? `本地曲库 ${importedTracks.length} 首` : '本地体验模式'
          }}</small>
        </span>
      </button>
      <button
        class="icon-button subtle"
        :class="{ active: ui.eqEnabled.value }"
        aria-label="均衡器"
        title="均衡器"
        @click="ui.togglePanel('equalizer')"
      >
        <AppIcon name="sliders" :size="17" />
      </button>
      <button
        class="icon-button subtle"
        :aria-label="ui.theme.value === 'dark' ? '切换到亮色主题' : '切换到暗色主题'"
        title="切换主题"
        @click="ui.toggleTheme()"
      >
        <AppIcon :name="ui.theme.value === 'dark' ? 'sun' : 'moon'" :size="17" />
      </button>
      <WindowControls />
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: grid;
  /* 中间列跟着搜索框宽度一起变化：收起 320px、展开 520px，右侧操作区自动让位 */
  grid-template-columns: 76px auto minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  height: var(--header-h);
  padding: 0 var(--content-pad);
  border-bottom: 1px solid var(--divider);
  background: var(--surface);
  /* 窗口拖拽区；下面每个可点元素都必须显式退出，否则点不动 */
  -webkit-app-region: drag;
}
.topbar button,
.topbar input {
  -webkit-app-region: no-drag;
}

.history-controls {
  display: flex;
  gap: 8px;
}
.round-control {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 50%;
  color: var(--text-2);
  background: var(--surface-soft);
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.round-control:hover:not(:disabled) {
  color: var(--text-1);
  background: var(--surface-hover);
}
.round-control:disabled {
  color: var(--text-3);
  opacity: 0.5;
}

.topbar-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}
.account {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 4px 10px 4px 4px;
  border-radius: var(--r-pill);
  background: var(--surface-soft);
  transition: background var(--dur-1) ease;
}
.account:hover {
  background: var(--surface-hover);
}
.avatar {
  /* 必须显式 block：main.css 里遗留的全局 .avatar 是 display: grid，
     那会让 img 变成网格容器，object-fit 失效 */
  display: block;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--brand);
  object-fit: cover;
}
.account-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.3;
}
.account-copy strong {
  color: var(--text-1);
  font-size: 13px;
  font-weight: 500;
}
.account-copy small {
  color: var(--text-3);
  font-size: 11px;
}
.icon-button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: var(--r-md);
  color: var(--text-2);
  background: transparent;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.icon-button:hover {
  color: var(--text-1);
  background: var(--surface-soft);
}
.icon-button.active {
  color: var(--brand);
}
</style>

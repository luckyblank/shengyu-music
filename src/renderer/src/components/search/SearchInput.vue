<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import { dismissSearch, openAllResults } from '../../composables/useSearchDiscovery'
import * as ui from '../../stores/ui'

/**
 * 顶栏搜索框。
 *
 * 只负责「输入 + 展开/收起 + 回车去结果页」；下拉内容整个搬到 SearchOverlay 里，
 * 不再是输入框下面的小气泡 —— 搜索被重新定位成发现入口，不是补全工具。
 *
 * 宽度 320px ↔ 520px 与描边光环都在这里：顶栏的栅格列会跟着一起撑开。
 *
 * 展开同时挂在 focus 与 click 上。只监听 focus 会漏一种情况：回车进结果页后
 * 输入框仍是焦点元素，用户再点它不会触发 focus，浮层就再也打不开了。
 */

const openIfClosed = (): void => {
  // 已经展开时不重复处理，避免每次点输入框都重跑一遍浮层的进入动画
  if (!ui.searchOpen.value) ui.openSearch()
}
</script>

<template>
  <label class="search-field" :class="{ open: ui.searchOpen.value }">
    <AppIcon name="search" :size="17" />
    <input
      v-model="ui.searchQuery.value"
      type="search"
      placeholder="搜索歌曲、歌手、专辑或歌单"
      aria-label="搜索歌曲、歌手、专辑或歌单"
      @focus="openIfClosed"
      @click="openIfClosed"
      @keydown.enter="openAllResults()"
      @keydown.esc="dismissSearch()"
    />
    <button
      v-if="ui.searchOpen.value"
      class="esc-key"
      title="关闭搜索"
      aria-label="关闭搜索"
      @mousedown.prevent
      @click="dismissSearch()"
    >
      ESC
    </button>
    <kbd v-else>Ctrl K</kbd>
  </label>
</template>

<style scoped>
.search-field {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  justify-self: start;
  width: 320px;
  height: 38px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--divider);
  border-radius: var(--r-pill);
  color: var(--text-3);
  background: var(--surface-soft);
  transition:
    width var(--dur-2) var(--ease),
    border-color var(--dur-1) ease,
    background var(--dur-1) ease,
    box-shadow var(--dur-1) ease;
}
/* 顶部有一条窗口拖拽区，表单元素必须显式退出，否则点不动也选不中文字 */
.search-field,
.search-field input,
.search-field button {
  -webkit-app-region: no-drag;
}
.search-field.open {
  width: 520px;
}
.search-field:focus-within {
  /* 红色透明描边 + 4px 光环，比默认 outline 方框更贴合圆角 */
  border-color: var(--brand-ring);
  background: var(--surface);
  box-shadow: 0 0 0 4px var(--brand-soft);
}
.search-field input {
  width: 100%;
  border: 0;
  outline: none;
  color: var(--text-1);
  background: transparent;
  font-size: 14px;
}
.search-field input::placeholder {
  color: var(--text-3);
}
.search-field kbd,
.esc-key {
  padding: 1px 6px;
  border: 1px solid var(--divider);
  border-radius: var(--r-xs);
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
  transition:
    color var(--dur-1) ease,
    border-color var(--dur-1) ease;
}
.esc-key:hover {
  color: var(--brand);
  border-color: var(--brand-ring);
}

/* 浮层展开时窗口可能被缩到最小宽，输入框不能把右侧操作区挤出去 */
@media (max-width: 1180px) {
  .search-field.open {
    width: 420px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .search-field {
    transition: none;
  }
}
</style>

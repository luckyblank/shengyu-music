<script setup lang="ts">
import { watch } from 'vue'
import EmotionTags from './EmotionTags.vue'
import HotSearchList from './HotSearchList.vue'
import RecentListen from './RecentListen.vue'
import RecentSearch from './RecentSearch.vue'
import RecommendSongs from './RecommendSongs.vue'
import SearchResults from './SearchResults.vue'
import { dismissSearch, normalizedQuery } from '../../composables/useSearchDiscovery'
import * as online from '../../stores/online'
import * as ui from '../../stores/ui'

/**
 * 搜索浮层 —— 点击搜索框后展开的那一整块。
 *
 * 三个约束决定了实现方式：
 *   1. 必须是 Teleport。main.css 给 .topbar 上了 backdrop-filter，它会让顶栏成为
 *      固定定位后代的包含块，浮层若留在顶栏里就会按顶栏的坐标去定位。
 *   2. 遮罩只盖顶栏以下。搜索框本身要保持可输入，点一下遮罩就收起来会让人没法改关键词。
 *   3. 内容自上而下是一条「发现流」：最近搜索 → 猜你喜欢 → 热门搜索 → 可能喜欢 → 最近听过。
 *      没有输入时展示这些，有输入时换成实时结果 —— 同一块区域，两种状态。
 */

// 榜单是热门搜索的数据来源。只在浮层真正展开时才拉：它常驻在 App 里，
// 若在 onMounted 拉，等于每次启动都为了一个用户可能不打开的浮层去抢一次网络与榜单快照写入。
watch(
  () => ui.searchOpen.value,
  (open) => {
    // 缓存命中时这次调用几乎不花钱
    if (open) void online.loadChart()
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="search-layer">
      <div v-if="ui.searchOpen.value" class="search-layer">
        <div class="search-scrim" @click="dismissSearch()"></div>
        <section class="search-panel" role="dialog" aria-label="搜索与发现">
          <SearchResults v-if="normalizedQuery" />
          <template v-else>
            <RecentSearch />
            <EmotionTags />
            <HotSearchList />
            <RecommendSongs />
            <RecentListen />
          </template>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.search-layer {
  position: fixed;
  z-index: 24;
  inset: 0;
  /* 层本身不吃鼠标事件：顶栏区域要留给输入框和窗口控制 */
  pointer-events: none;
}

.search-scrim {
  position: absolute;
  /* 底边停在播放条上方：否则「点外部关闭」会把播放/切歌/进度条一并吃掉 */
  inset: var(--header-h) 0 var(--player-h) 0;
  background: var(--scrim);
  pointer-events: auto;
}

.search-panel {
  position: absolute;
  /*
   * 左边缘 = 侧栏 + 内容内边距 + 圆形历史按钮 + 栅格间距，正好落在搜索框左边缘；
   * 右边缘退到 --content-pad，与页面内容的右边界对齐。
   */
  top: calc(var(--header-h) + 10px);
  left: calc(var(--sidebar-w) + var(--content-pad) + 96px);
  width: min(960px, calc(100vw - var(--sidebar-w) - var(--content-pad) * 2 - 96px));
  /* 高度上限同时受窗口高度约束：1320×940 下取满 680，再矮就跟着缩 */
  height: min(680px, calc(100vh - var(--header-h) - var(--player-h) - 26px));
  padding: 24px;
  overflow-x: hidden;
  overflow-y: auto;
  /* 滚到底不要把底下的页面一起带着滚 */
  overscroll-behavior: contain;
  border: 1px solid var(--divider);
  border-radius: var(--r-xl);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  pointer-events: auto;
}

/* 内容逐块淡入：整块一起弹出会像「换了个页面」，逐块出来才像在陆续递东西给你 */
.search-panel > * {
  animation: search-rise 260ms var(--ease) backwards;
}
.search-panel > *:nth-child(2) {
  animation-delay: 40ms;
}
.search-panel > *:nth-child(3) {
  animation-delay: 80ms;
}
.search-panel > *:nth-child(4) {
  animation-delay: 120ms;
}
.search-panel > *:nth-child(n + 5) {
  animation-delay: 160ms;
}
@keyframes search-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.search-layer-enter-active,
.search-layer-leave-active {
  transition: opacity 200ms ease;
}
.search-layer-enter-from,
.search-layer-leave-to {
  opacity: 0;
}
.search-layer-enter-active .search-panel,
.search-layer-leave-active .search-panel {
  transition: transform 200ms var(--ease);
}
/* 浮层从搜索框下方长出来：位移方向与「下拉」一致，比缩放更稳 */
.search-layer-enter-from .search-panel,
.search-layer-leave-to .search-panel {
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .search-layer-enter-active,
  .search-layer-leave-active,
  .search-layer-enter-active .search-panel,
  .search-layer-leave-active .search-panel {
    transition: none;
  }
  .search-panel > * {
    animation: none;
  }
}
</style>

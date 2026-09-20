<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import { guessYouSearch, rotateGuess, openResultsWith } from '../../composables/useSearchDiscovery'

/**
 * 猜你想搜 —— 浮层的第一行。
 *
 * 每个词都是从真实播放/收藏/曲库/榜单里推出来的（见 useSearchDiscovery 的 guessPool），
 * 因此点下去一定有结果；首枚用品牌色，是设计稿里的「今天先看这个」。
 */
</script>

<template>
  <section v-if="guessYouSearch.length" class="guess">
    <div class="guess-head">
      <h3>猜你想搜</h3>
      <button class="swap" @click="rotateGuess()">
        <AppIcon name="refresh" :size="12" />换一换
      </button>
    </div>
    <div class="guess-pills">
      <button
        v-for="(item, index) in guessYouSearch"
        :key="item.id"
        class="pill"
        :class="{ lead: index === 0 }"
        :title="item.hint"
        @click="openResultsWith(item.keyword)"
      >
        {{ item.label }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.guess {
  margin-bottom: 20px;
}
.guess-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.guess-head h3 {
  color: var(--text-1);
  font-size: 17px;
  font-weight: 600;
}
.swap {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: var(--text-3);
  background: transparent;
  font-size: 12px;
  transition: color var(--dur-1) ease;
}
.swap:hover {
  color: var(--brand);
}

.guess-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pill {
  height: 30px;
  padding: 0 14px;
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: var(--surface-soft);
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.pill:hover {
  color: var(--text-1);
  background: var(--surface-soft-hover);
}
/* 首枚是设计稿里的「重点推荐」档，用品牌浅底把它从一排灰胶囊里拎出来 */
.pill.lead {
  color: var(--brand);
  background: var(--brand-soft);
}
.pill.lead:hover {
  color: var(--brand-hover);
}
</style>

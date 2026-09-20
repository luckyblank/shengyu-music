<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import { openPage } from '../../composables/useSearchDiscovery'

/**
 * 浮层底部的探索横幅。
 *
 * 文案是本项目自己的：「去发现，那些还没被听见的声音」。设计稿那一格原本是
 * 站方的推广位，我们没有可投的广告，与其塞一句别人的 slogan，不如让这个位置
 * 承担它唯一说得通的功能 —— 把没有明确搜索目标的人送去发现页。
 */
</script>

<template>
  <button class="banner" @click="openPage('discover')">
    <span class="copy">
      <strong>去发现，那些还没被听见的声音</strong>
      <small>每日推荐、电台与榜单都在发现页等你</small>
    </span>
    <span class="go">
      开始探索
      <AppIcon name="arrow" :size="14" />
    </span>
  </button>
</template>

<style scoped>
.banner {
  display: flex;
  gap: 16px;
  align-items: center;
  width: 100%;
  padding: 16px 20px;
  border-radius: var(--r-lg);
  background: var(--surface-soft);
  text-align: left;
  transition: background var(--dur-1) ease;
}
.banner:hover {
  background: var(--surface-soft-hover);
}

.copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 3px;
}
.copy strong {
  color: var(--text-1);
  font-size: 14px;
  font-weight: 600;
}
.copy small {
  color: var(--text-3);
  font-size: 12px;
}

.go {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 32px;
  flex: 0 0 auto;
  padding: 0 16px;
  border-radius: var(--r-pill);
  color: var(--on-brand);
  background: var(--brand);
  font-size: 13px;
  transition: background var(--dur-1) ease;
}
.banner:hover .go {
  background: var(--brand-hover);
}
</style>

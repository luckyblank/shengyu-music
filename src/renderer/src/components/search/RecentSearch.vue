<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import SectionHeading from '../music/SectionHeading.vue'
import { applyKeyword } from '../../composables/useSearchDiscovery'
import * as ui from '../../stores/ui'

/** 最近搜索：浮层的第一屏。上限 8 条 —— 再多就不叫「最近」了，也会把下面的模块推走。 */
const MAX = 8

const items = computed(() => ui.searchHistory.value.slice(0, MAX))
</script>

<template>
  <section class="block">
    <SectionHeading title="最近搜索" size="sm">
      <template #action>
        <button v-if="items.length" class="clear-btn" @click="ui.clearSearchHistory()">
          <AppIcon name="trash" :size="13" />清空
        </button>
      </template>
    </SectionHeading>

    <div v-if="items.length" class="chips">
      <span v-for="word in items" :key="word" class="chip">
        <button class="chip-main" @click="applyKeyword(word)">{{ word }}</button>
        <button
          class="chip-drop"
          :title="`删除「${word}」`"
          :aria-label="`删除「${word}」`"
          @click="ui.removeSearchHistory(word)"
        >
          <AppIcon name="close" :size="11" />
        </button>
      </span>
    </div>
    <p v-else class="empty">还没有搜索记录，从下面的热搜榜挑一个也行</p>
  </section>
</template>

<style scoped>
.block {
  min-width: 0;
}

.clear-btn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: var(--text-3);
  font-size: 12px;
  transition: color var(--dur-1) ease;
}
.clear-btn:hover {
  color: var(--brand);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding-right: 4px;
  /* Tag 圆角取体系里的 16px；32px 高的胶囊上它正好读作全圆 */
  border-radius: var(--r-xl);
  background: var(--surface-soft);
  transition: background var(--dur-1) ease;
}
.chip:hover {
  background: var(--surface-soft-hover);
}
.chip-main {
  max-width: 220px;
  height: 100%;
  padding: 0 8px 0 12px;
  overflow: hidden;
  color: var(--text-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--dur-1) ease;
}
.chip:hover .chip-main {
  color: var(--text-1);
}
/* 删除键占位常驻（只是透明），否则 hover 时才出现的叉会把整排胶囊挤得左移 */
.chip-drop {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  color: var(--text-3);
  border-radius: 50%;
  opacity: 0;
  transition:
    opacity var(--dur-1) ease,
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.chip:hover .chip-drop,
.chip-drop:focus-visible {
  opacity: 1;
}
.chip-drop:hover {
  color: var(--brand);
  background: var(--surface);
}
@media (hover: none) {
  .chip-drop {
    opacity: 1;
  }
}

.empty {
  color: var(--text-3);
  font-size: 13px;
}
</style>

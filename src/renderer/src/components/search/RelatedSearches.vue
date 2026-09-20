<script setup lang="ts">
import {
  applyKeyword,
  normalizedQuery,
  relatedSearches
} from '../../composables/useSearchDiscovery'

/**
 * 相关搜索 —— 结果页右栏第一格。
 *
 * 词是从命中曲目里反推出来的真实歌手名 / 流派名 / 专辑名（见 useSearchDiscovery），
 * 所以点下去一定有结果；这比让模型编几个「相关词」更可靠，也不会把用户带进空页。
 */
</script>

<template>
  <section v-if="normalizedQuery && relatedSearches.length" class="related">
    <h3>相关搜索</h3>
    <div class="pills">
      <button
        v-for="word in relatedSearches"
        :key="word"
        class="pill"
        :title="`搜索「${word}」`"
        @click="applyKeyword(word, true)"
      >
        {{ word }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.related h3 {
  margin-bottom: 12px;
  color: var(--text-1);
  font-size: 15px;
  font-weight: 600;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pill {
  max-width: 100%;
  height: 30px;
  padding: 0 14px;
  overflow: hidden;
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: var(--surface-soft);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.pill:hover {
  color: var(--text-1);
  background: var(--surface-soft-hover);
}
</style>

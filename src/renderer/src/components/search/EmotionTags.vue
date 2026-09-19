<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import SectionHeading from '../music/SectionHeading.vue'
import { applyKeyword, emotionTags, hasTasteProfile } from '../../composables/useSearchDiscovery'

/**
 * 猜你喜欢 —— 情绪标签。
 *
 * 刻意不做成普通按钮：每个标签是「情绪词 + 它背后真实存在的流派/歌手」两行结构，
 * 主文案负责共鸣，副文案负责让人相信点了真能搜到东西。
 */

const note = computed(() => (hasTasteProfile.value ? '根据你的播放与收藏' : '多听几首会越来越准'))
</script>

<template>
  <section class="block">
    <SectionHeading title="猜你喜欢" size="sm" :note="note" />

    <div v-if="emotionTags.length" class="moods">
      <button
        v-for="tag in emotionTags"
        :key="tag.id"
        class="mood"
        :title="`搜索「${tag.keyword}」`"
        @click="applyKeyword(tag.keyword)"
      >
        <AppIcon :name="tag.icon" :size="14" />
        <span class="mood-copy">
          <strong>{{ tag.label }}</strong>
          <small>{{ tag.hint }}</small>
        </span>
      </button>
    </div>
    <p v-else class="empty">曲库还是空的，导入或收藏几首之后这里就会亮起来</p>
  </section>
</template>

<style scoped>
.block {
  margin-bottom: 22px;
}

.moods {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mood {
  display: inline-flex;
  gap: 9px;
  align-items: center;
  height: 42px;
  padding: 0 14px;
  border: 1px solid transparent;
  /* 用设计体系里的 Tag 圆角（16px），不做成整颗胶囊：情绪标签要像标签，不像按钮 */
  border-radius: var(--r-xl);
  color: var(--brand);
  background: var(--surface-soft);
  transition:
    background var(--dur-1) ease,
    border-color var(--dur-1) ease,
    transform var(--dur-1) var(--ease);
}
.mood:hover {
  border-color: var(--brand-ring);
  background: var(--brand-soft);
  transform: translateY(-1px);
}
.mood-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}
.mood-copy strong {
  color: var(--text-1);
  font-size: 13.5px;
  font-weight: 500;
}
.mood-copy small {
  color: var(--text-3);
  font-size: 11px;
}

.empty {
  color: var(--text-3);
  font-size: 13px;
}

@media (prefers-reduced-motion: reduce) {
  .mood:hover {
    transform: none;
  }
}
</style>

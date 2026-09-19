<script setup lang="ts">
import AppIcon from '../AppIcon.vue'

/**
 * 区块标题 —— 全应用统一的「标题 + 右侧动作」结构。
 *
 * 规范：区块标题 24px/600，不再用超大字号；右侧动作用文字按钮，不用按钮块。
 * size="sm" 是给浮层/弹层里的二级区块用的（搜索浮层内容多，24px 标题会把
 * 首屏挤掉一整行内容），页面主区块仍用默认档。
 */

withDefaults(
  defineProps<{
    title: string
    /** 标题左侧的补充说明，例如「每周三更新」 */
    note?: string
    /** note 的呈现方式：muted 是灰色小字，brand 是品牌色浅底标签（推荐页用它标推荐依据） */
    noteTone?: 'muted' | 'brand'
    /** 右侧文字按钮的文案，不传则不显示 */
    action?: string
    /** 动作按钮文案前的图标名，例如「播放全部」前的播放键 */
    actionIcon?: string
    icon?: string
    size?: 'md' | 'sm'
  }>(),
  { note: '', noteTone: 'muted', action: '', actionIcon: '', icon: '', size: 'md' }
)

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="section-heading" :class="`heading-${size}`">
    <div class="heading-main">
      <AppIcon v-if="icon" :name="icon" :size="size === 'sm' ? 14 : 16" />
      <h2>{{ title }}</h2>
      <span v-if="note" class="heading-note" :class="`note-${noteTone}`">{{ note }}</span>
    </div>
    <button v-if="action" class="heading-action" @click="emit('action')">
      <AppIcon v-if="actionIcon" :name="actionIcon" :size="size === 'sm' ? 12 : 14" />
      {{ action }}
      <AppIcon name="arrow" :size="14" />
    </button>
    <slot name="action"></slot>
  </div>
</template>

<style scoped>
.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}
.heading-main {
  display: flex;
  gap: 10px;
  align-items: baseline;
  min-width: 0;
}
.section-heading h2 {
  color: var(--text-1);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.heading-note {
  color: var(--text-3);
  font-size: 13px;
}
/* 品牌浅底标签：当 note 讲的是「为什么给你这些内容」时，它值得比灰色小字更高的权重 */
.heading-note.note-brand {
  padding: 3px 10px;
  border-radius: var(--r-pill);
  color: var(--brand);
  background: var(--brand-soft);
  font-size: 12px;
  line-height: 1.5;
}
.heading-action {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: var(--text-2);
  background: transparent;
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    gap var(--dur-1) ease;
}
.heading-action:hover {
  gap: 7px;
  color: var(--brand);
}

/* 浮层内的紧凑档：标题 17px，让首屏能多露出一行内容 */
.heading-sm {
  margin-bottom: 12px;
}
.heading-sm h2 {
  font-size: 17px;
}
.heading-sm .heading-note {
  font-size: 12px;
}
.heading-sm .heading-note.note-brand {
  padding: 2px 8px;
  font-size: 11px;
}
.heading-sm .heading-action {
  font-size: 12px;
}
</style>

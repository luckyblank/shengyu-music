<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import type { CoverSpec } from '@renderer/types/music'

defineProps<{
  cover?: CoverSpec
  title: string
  subtitle?: string
  /** 该集合正在播放时把播放键换成暂停键 */
  playing?: boolean
}>()

const emit = defineEmits<{ play: [] }>()
</script>

<template>
  <!-- 整卡可点：每日推荐的这些集合没有详情页，卡片本身就是「开始听」的入口 -->
  <article
    class="photo-card"
    role="button"
    tabindex="0"
    :aria-label="`播放${title}`"
    @click="emit('play')"
    @keydown.enter.prevent="emit('play')"
  >
    <CoverArt :cover="cover" />
    <span class="photo-scrim" aria-hidden="true"></span>
    <div class="photo-copy">
      <h3>{{ title }}</h3>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <button type="button" class="photo-play" @click.stop="emit('play')">
      <AppIcon :name="playing ? 'pause' : 'play'" :size="15" :stroke-width="2.2" />
    </button>
  </article>
</template>

<style scoped>
.photo-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--r-xl);
  cursor: pointer;
  transition:
    transform var(--dur-2) var(--ease),
    box-shadow var(--dur-2) var(--ease);
}

.photo-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
}

/* CoverArt 自带 1:1 与 medium 尺寸的圆角，这里覆盖成略高的照片比例（父选择器优先级更高） */
.photo-card .cover-art {
  border-radius: var(--r-xl);
  aspect-ratio: 1 / 1.1;
}

.photo-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(12, 16, 24, 0) 42%, rgba(12, 16, 24, 0.74) 100%);
  pointer-events: none;
}

.photo-copy {
  position: absolute;
  right: 54px;
  bottom: 12px;
  left: 14px;
  pointer-events: none;
}

.photo-copy h3 {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-copy p {
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 11.5px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 设计图里播放键是常显的，因此用半透明白底 + 白描边，而不是 hover 才出现的实心红点 */
.photo-play {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  width: 34px;
  height: 34px;
  color: #fff;
  background: rgba(255, 255, 255, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  place-items: center;
  transition:
    background var(--dur-1) var(--ease),
    transform var(--dur-1) var(--ease);
}

.photo-card:hover .photo-play {
  background: var(--brand);
  border-color: var(--brand);
  transform: scale(1.06);
}

@media (prefers-reduced-motion: reduce) {
  .photo-card,
  .photo-play {
    transition: none;
  }

  .photo-card:hover,
  .photo-card:hover .photo-play {
    transform: none;
  }
}
</style>

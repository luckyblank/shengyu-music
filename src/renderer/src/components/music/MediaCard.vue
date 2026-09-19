<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import CoverArt from '../CoverArt.vue'
import type { CoverSpec } from '../../types/music'

/**
 * 封面卡片 —— 歌单 / 榜单 / 电台共用的卡片原语。
 *
 * 规范：封面是视觉主体，文字在下方；卡片本身不加深色底与重阴影，
 * hover 只抬 2px 并浮出播放键，避免「厚重卡片」。
 */

withDefaults(
  defineProps<{
    cover?: CoverSpec
    title: string
    subtitle?: string
    /** 封面左上角角标，例如「12 首」「136 人」「TOP 3」 */
    badge?: string
    /** 封面内叠加的说明文字（网易云「官方歌单」那种压在封面上的标题） */
    overlay?: string
    /** 封面下方的两行简介 */
    description?: string
    playing?: boolean
  }>(),
  { subtitle: '', badge: '', overlay: '', description: '', playing: false }
)

const emit = defineEmits<{ play: []; open: [] }>()
</script>

<template>
  <article class="media-card" tabindex="0" @dblclick="emit('open')" @keydown.enter="emit('open')">
    <div class="card-cover">
      <CoverArt :cover="cover" />
      <span v-if="badge" class="card-badge">{{ badge }}</span>
      <span v-if="overlay" class="card-overlay">{{ overlay }}</span>
      <button class="card-play" :aria-label="`播放${title}`" @click.stop="emit('play')">
        <AppIcon :name="playing ? 'pause' : 'play'" :size="16" :stroke-width="2.4" />
      </button>
    </div>
    <h3 :title="title">{{ title }}</h3>
    <p v-if="description" class="card-desc">{{ description }}</p>
    <p v-else-if="subtitle" class="card-sub">{{ subtitle }}</p>
  </article>
</template>

<style scoped>
.media-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  transition: transform var(--dur-2) var(--ease);
}
/* 规范：hover 只抬 2px，不做大位移 */
.media-card:hover {
  transform: translateY(-2px);
}

.card-cover {
  position: relative;
  border-radius: var(--r-lg);
}
.card-cover .cover-art {
  border-radius: var(--r-lg);
}

.card-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  gap: 3px;
  align-items: center;
  padding: 2px 7px;
  border-radius: var(--r-sm);
  color: #fff;
  background: rgba(12, 16, 24, 0.55);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
}

/* 封面内的标题压在渐变上，保证任意封面上都能读清 */
.card-overlay {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 26px 10px 9px;
  border-radius: 0 0 var(--r-lg) var(--r-lg);
  color: #fff;
  background: linear-gradient(180deg, transparent, rgba(12, 16, 24, 0.62));
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  text-align: left;
}

.card-play {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  color: var(--on-brand);
  background: var(--brand);
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity var(--dur-1) ease,
    transform var(--dur-2) var(--ease);
}
.media-card:hover .card-play,
.card-play:focus-visible {
  opacity: 1;
  transform: translateY(0);
}
.card-play:hover {
  background: var(--brand-hover);
}

.media-card h3 {
  overflow: hidden;
  color: var(--text-1);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-desc {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.card-sub {
  overflow: hidden;
  color: var(--text-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

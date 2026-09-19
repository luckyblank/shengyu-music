<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'

/**
 * 行内快速播放按钮。
 *
 * 自身只负责「长什么样、点了发出什么」，显隐交给所在行控制（见 SearchSongItem 的
 * .song-item:hover 规则）：搜索浮层一屏五首，五个实心圆按钮会把「看歌单」变成「看按钮」。
 */

const props = withDefaults(
  defineProps<{
    /** 当前行就是正在播放的曲目 */
    active?: boolean
    /** 正在出声（active 且未暂停） */
    playing?: boolean
    label?: string
  }>(),
  { active: false, playing: false, label: '播放' }
)

const emit = defineEmits<{ play: []; pause: [] }>()

const showingPause = computed(() => props.active && props.playing)
const hint = computed(() => (showingPause.value ? '暂停' : props.label))

const onClick = (event: MouseEvent): void => {
  // 行本身也能点播：不拦冒泡就会先 pause 再 play，听感上是「点了没反应」
  event.stopPropagation()
  if (showingPause.value) emit('pause')
  else emit('play')
}
</script>

<template>
  <button class="quick-play" :title="hint" :aria-label="hint" @click="onClick">
    <AppIcon :name="showingPause ? 'pause' : 'play'" :size="13" />
  </button>
</template>

<style scoped>
.quick-play {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  /* 播放三角视觉重心偏左，补 1px 才像居中 */
  padding-left: 1px;
  border-radius: 50%;
  color: var(--on-brand);
  background: var(--brand);
  box-shadow: var(--shadow-1);
  transition:
    background var(--dur-1) ease,
    transform var(--dur-1) var(--ease);
}
.quick-play:hover {
  background: var(--brand-hover);
  transform: scale(1.06);
}
.quick-play:active {
  transform: scale(0.94);
}
@media (prefers-reduced-motion: reduce) {
  .quick-play:hover,
  .quick-play:active {
    transform: none;
  }
}
</style>

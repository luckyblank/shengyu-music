<script setup lang="ts">
import { computed } from 'vue'
import type { CoverSpec, CoverVariant } from '../types/music'

const props = withDefaults(
  defineProps<{
    cover?: CoverSpec | CoverVariant
    size?: 'tiny' | 'small' | 'medium' | 'large'
    rotating?: boolean
  }>(),
  { cover: 'ember', size: 'medium', rotating: false }
)

const spec = computed<CoverSpec>(() =>
  typeof props.cover === 'string' ? { kind: 'variant', variant: props.cover } : props.cover
)
const variant = computed(() => (spec.value.kind === 'variant' ? spec.value.variant : 'ember'))
const imageUrl = computed(() => (spec.value.kind === 'url' ? spec.value.url : null))
</script>

<template>
  <div class="cover-art" :class="[`cover-${variant}`, `cover-${size}`, { rotating }]">
    <img v-if="imageUrl" class="cover-image" :src="imageUrl" alt="" draggable="false" />
    <template v-else>
      <span class="cover-grain"></span><span class="cover-orbit cover-orbit-a"></span
      ><span class="cover-orbit cover-orbit-b"></span><span class="cover-core"></span
      ><span class="cover-mark">ST</span>
    </template>
  </div>
</template>

<style scoped>
/*
 * 封面圆角以令牌为准。注意：组件 scoped 样式在 main.css 之后注入，
 * 同特异性下这里会反杀全局规则 —— 改封面圆角必须改这里，只改 main.css 无效。
 */
.cover-art {
  position: relative;
  overflow: hidden;
  flex: 0 0 auto;
  border-radius: var(--r-lg);
  isolation: isolate;
  box-shadow: inset 0 0 0 1px var(--divider);
}
/* 搜索浮层里的行高 40px —— 48 会把「一屏看五首」挤成「一屏看四首」 */
.cover-tiny {
  width: 40px;
  height: 40px;
  border-radius: var(--r-sm);
}
.cover-small {
  width: 48px;
  height: 48px;
  border-radius: var(--r-md);
}
.cover-medium {
  width: 100%;
  aspect-ratio: 1;
}
.cover-large {
  width: min(24vw, 280px);
  aspect-ratio: 1;
  border-radius: var(--r-xl);
  box-shadow: inset 0 0 0 1px var(--divider);
}
.cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.cover-ember {
  background: linear-gradient(145deg, #ef6b4f 0%, #b93b30 46%, #3b1820 100%);
}
.cover-tide {
  background: linear-gradient(145deg, #3c9cab 0%, #236276 48%, #122e46 100%);
}
.cover-moss {
  background: linear-gradient(145deg, #97a86d 0%, #536440 48%, #253528 100%);
}
.cover-violet {
  background: linear-gradient(145deg, #8a7ca5 0%, #554d72 48%, #29263f 100%);
}
.cover-sand {
  background: linear-gradient(145deg, #d5aa72 0%, #9c704f 48%, #4a342d 100%);
}
.cover-night {
  background: linear-gradient(145deg, #6b798e 0%, #313b4c 48%, #171b25 100%);
}
.cover-grain {
  position: absolute;
  inset: 0;
  opacity: 0.34;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E");
  mix-blend-mode: soft-light;
}
.cover-orbit {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.44);
  border-radius: 50%;
}
.cover-orbit-a {
  width: 74%;
  height: 74%;
  top: -22%;
  right: -16%;
}
.cover-orbit-b {
  width: 92%;
  height: 92%;
  bottom: -44%;
  left: -26%;
  border-width: 18px;
  opacity: 0.2;
}
.cover-core {
  position: absolute;
  width: 24%;
  height: 24%;
  left: 19%;
  top: 24%;
  border-radius: 50%;
  background: rgba(255, 248, 235, 0.86);
  box-shadow: 0 0 0 8px var(--line);
}
.cover-mark {
  position: absolute;
  right: 10%;
  bottom: 8%;
  color: rgba(255, 255, 255, 0.72);
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 9px;
  letter-spacing: 0.14em;
}
.cover-large .cover-mark {
  font-size: 12px;
}
.cover-small .cover-mark,
.cover-tiny .cover-mark {
  display: none;
}
.rotating .cover-orbit-a,
.rotating .cover-core {
  animation: cover-drift 8s linear infinite;
  transform-origin: 40% 60%;
}
@keyframes cover-drift {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .rotating .cover-orbit-a,
  .rotating .cover-core {
    animation: none;
  }
}
</style>

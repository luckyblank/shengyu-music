<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * 桌面歌词悬浮窗（?desktop-lyrics=1）：
 * 透明无边框置顶小窗。平时只有歌词文字（深色描边保证任意壁纸可读）；
 * 鼠标悬停时浮出毛玻璃背景卡与关闭按钮，移开即隐去。
 * 逐字卡拉OK：已唱 = 自定义歌词色，当前字放大，未唱 = 白。
 */

const line = ref<{ current: string; next: string; words: string[]; wordIndex: number }>({
  current: '',
  next: '',
  words: [],
  wordIndex: -1
})
const hovering = ref(false)

const unsubscribe = window.shengyu.onLyricLine((payload) => {
  line.value = payload
})

// 歌词颜色同步：主窗口改色后广播到这里
const unsubscribeColor = window.shengyu.onLyricsColor((color) => {
  document.documentElement.style.setProperty('--lyrics-color', color)
})

// 主动拉取一次当前颜色：避免 ready-to-show 推送与动态 import 的竞态导致颜色丢失
void window.shengyu.getLyricsColor().then((color) => {
  if (/^#[0-9a-fA-F]{6}$/.test(color ?? '')) {
    document.documentElement.style.setProperty('--lyrics-color', color)
  }
})

const close = (): void => {
  void window.shengyu.exitDesktopLyrics()
}

onBeforeUnmount(() => {
  unsubscribe()
  unsubscribeColor()
})
</script>

<template>
  <div
    class="desktop-lyrics"
    :class="{ hovering }"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <div class="dl-panel" aria-hidden="true"></div>
    <button
      class="dl-close-btn"
      aria-label="关闭桌面歌词"
      title="关闭桌面歌词"
      @pointerdown.stop="close"
      @click.stop="close"
    >
      <AppIcon name="close" :size="15" />
    </button>
    <p class="dl-current" :class="{ empty: !line.current }">
      <template v-if="line.current && line.words.length">
        <span
          v-for="(word, index) in line.words"
          :key="index"
          class="dl-word"
          :class="{
            sung: index < line.wordIndex,
            active: index === line.wordIndex
          }"
          >{{ word }}</span
        >
      </template>
      <template v-else>{{ line.current || '声屿音乐 · 桌面歌词' }}</template>
    </p>
    <p class="dl-next">{{ line.next }}</p>
  </div>
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  min-width: 0 !important;
  min-height: 0 !important;
  background: transparent !important;
  overflow: hidden;
}
#app {
  width: 100%;
  height: 100%;
  min-width: 0 !important;
  min-height: 0 !important;
}
</style>

<style scoped>
.desktop-lyrics {
  position: relative;
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  -webkit-app-region: drag;
}
/* 悬停浮出的毛玻璃背景卡 */
.dl-panel {
  position: absolute;
  inset: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--r-xl);
  background: rgba(13, 15, 18, 0.46);
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.35);
  opacity: 0;
  pointer-events: none;
  /* 规范：不使用玻璃拟态，桌面歌词条用实底 */
  transition: opacity 220ms ease;
}
.dl-panel::before {
  position: absolute;
  top: 0;
  right: 22px;
  left: 22px;
  height: 2px;
  border-radius: 0 0 4px 4px;
  background: color-mix(in srgb, var(--lyrics-color, #ffffff) 65%, transparent);
  content: '';
}
.desktop-lyrics.hovering .dl-panel {
  opacity: 1;
}
/* 悬停才显示的关闭按钮：圆钮，悬浮变歌词色系强调 */
.dl-close-btn {
  position: absolute;
  z-index: 2;
  top: 16px;
  right: 16px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.42);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px) scale(0.8);
  -webkit-app-region: no-drag;
  transition:
    opacity 180ms ease,
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
    background 150ms ease,
    border-color 150ms ease;
}
.desktop-lyrics.hovering .dl-close-btn {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}
.dl-close-btn:hover {
  border-color: transparent;
  background: var(--accent);
  transform: scale(1.12);
}
.dl-close-btn:active {
  transform: scale(0.92);
}
.dl-current {
  position: relative;
  z-index: 1;
  max-width: 92%;
  overflow: hidden;
  /* 当前行整体使用用户自定义歌词色，改色立即生效 */
  color: var(--lyrics-color, #ffffff);
  font-size: 26px;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  text-shadow:
    0 0 3px rgba(0, 0, 0, 0.9),
    0 2px 8px rgba(0, 0, 0, 0.75);
  white-space: nowrap;
  transition: opacity 300ms ease;
}
.dl-current.empty {
  opacity: 0.55;
  font-size: 18px;
}
/* 逐字卡拉OK：已唱 = 自定义歌词色，当前字 = 放大强调，未唱 = 白色 */
.dl-word {
  /* 未唱的字显式白色：不能继承 .dl-current 的歌词色，否则整行同色、颜色设置看不出来 */
  color: #ffffff;
  transition:
    color 160ms ease,
    transform 160ms ease;
}
.dl-word.sung {
  color: var(--lyrics-color, #ffffff);
}
.dl-word.active {
  /* 当前字用白色高亮 + 放大，与自定义歌词色形成对比 */
  color: #ffffff;
  font-size: 1.18em;
  font-weight: 700;
  transform: translateY(-1px);
  text-shadow:
    0 0 6px var(--lyrics-color, #ffffff),
    0 2px 8px rgba(0, 0, 0, 0.85);
}
.dl-next {
  position: relative;
  z-index: 1;
  max-width: 88%;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.75);
  font-size: 14px;
  text-overflow: ellipsis;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
  transition: opacity 300ms ease;
}
.dl-next:empty {
  display: none;
}
</style>

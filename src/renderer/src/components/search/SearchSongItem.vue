<script setup lang="ts">
import { computed } from 'vue'
import CoverArt from '../CoverArt.vue'
import QuickPlayButton from './QuickPlayButton.vue'
import * as player from '../../stores/player'
import { formatTime } from '../../utils/format'
import type { Track } from '../../types/music'

/**
 * 搜索里的单曲行：40px 封面 + 曲名 + 歌手 · 专辑 + 时长 + 悬停播放。
 *
 * 播放状态直接读 player store 而不从父组件透传：同一行会在「可能喜欢」「最近听过」
 * 「实时结果」三处出现，逐层透传 active/playing 只会得到一堆重复的样板代码。
 */

const props = withDefaults(
  defineProps<{
    track: Track
    /** 命中高亮的查询词；不传则不拆分文本 */
    highlight?: string
  }>(),
  { highlight: '' }
)

const emit = defineEmits<{ play: []; pause: [] }>()

const active = computed(() => player.currentId.value === props.track.id)
const playing = computed(() => active.value && player.isPlaying.value)

interface TextPart {
  text: string
  hit: boolean
  /** 片段在标题里的起始下标，兼作 v-for 的 key：同一个词可能重复出现，用文本当 key 会撞 */
  at: number
}

/**
 * 把标题按查询词切成命中/未命中片段。
 *
 * 用 v-for 渲染片段而不是 v-html：曲名来自外部数据（文件名、在线接口），
 * 拼进 HTML 就是一个注入口子。
 */
const parts = computed<TextPart[]>(() => {
  const title = props.track.title
  const needle = props.highlight.trim().toLocaleLowerCase()
  if (!needle) return [{ text: title, hit: false, at: 0 }]

  const haystack = title.toLocaleLowerCase()
  const out: TextPart[] = []
  let cursor = 0
  let found = haystack.indexOf(needle)
  while (found !== -1) {
    if (found > cursor) out.push({ text: title.slice(cursor, found), hit: false, at: cursor })
    out.push({ text: title.slice(found, found + needle.length), hit: true, at: found })
    cursor = found + needle.length
    found = haystack.indexOf(needle, cursor)
  }
  if (cursor < title.length) out.push({ text: title.slice(cursor), hit: false, at: cursor })
  return out.length ? out : [{ text: title, hit: false, at: 0 }]
})
</script>

<template>
  <div
    class="song-item"
    :class="{ active }"
    role="button"
    tabindex="0"
    :aria-label="`播放 ${track.title}`"
    @click="emit('play')"
    @keydown.enter="emit('play')"
    @keydown.space.prevent="emit('play')"
  >
    <span class="song-cover">
      <CoverArt :cover="track.cover" size="tiny" />
      <span v-if="active" class="song-bars" aria-hidden="true">
        <i :class="{ still: !playing }"></i><i :class="{ still: !playing }"></i
        ><i :class="{ still: !playing }"></i>
      </span>
    </span>

    <span class="song-copy">
      <strong>
        <template v-for="part in parts" :key="part.at">
          <mark v-if="part.hit">{{ part.text }}</mark>
          <template v-else>{{ part.text }}</template>
        </template>
      </strong>
      <small
        >{{ track.artist }}<template v-if="track.album"> · {{ track.album }}</template></small
      >
    </span>

    <span class="song-time">{{ formatTime(track.duration) }}</span>

    <QuickPlayButton
      :active="active"
      :playing="playing"
      @play="emit('play')"
      @pause="emit('pause')"
    />
  </div>
</template>

<style scoped>
.song-item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto 30px;
  gap: 12px;
  align-items: center;
  padding: 6px 8px;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background var(--dur-1) ease;
}
.song-item:hover,
.song-item:focus-visible {
  background: var(--surface-hover);
  outline: none;
}

.song-cover {
  position: relative;
  display: block;
}
/* 正在播放的那一行：封面压一层暗，上面走三根音量柱 */
.song-cover::after {
  position: absolute;
  inset: 0;
  border-radius: var(--r-sm);
  background: rgba(10, 14, 22, 0.52);
  content: '';
  opacity: 0;
  transition: opacity var(--dur-1) ease;
}
.song-item.active .song-cover::after {
  opacity: 1;
}
.song-bars {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 2px;
  align-items: center;
  justify-content: center;
}
.song-bars i {
  width: 2px;
  height: 14px;
  border-radius: var(--r-pill);
  background: #fff;
  animation: bar-bounce 1s ease-in-out infinite;
}
.song-bars i:nth-child(2) {
  height: 9px;
  animation-delay: 0.18s;
}
.song-bars i:nth-child(3) {
  height: 12px;
  animation-delay: 0.36s;
}
/* 暂停时柱子停下并压平，避免「没声音却还在跳」 */
.song-bars i.still {
  height: 4px;
  animation: none;
}
@keyframes bar-bounce {
  0%,
  100% {
    transform: scaleY(0.55);
  }
  50% {
    transform: scaleY(1);
  }
}

.song-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.song-copy strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-copy mark {
  color: var(--brand);
  background: transparent;
}
.song-copy small {
  overflow: hidden;
  color: var(--text-2);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-time {
  color: var(--text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 播放按钮默认隐身，hover / 键盘聚焦 / 正在播放时才出现 */
.song-item :deep(.quick-play) {
  opacity: 0;
  transition:
    opacity var(--dur-1) ease,
    background var(--dur-1) ease,
    transform var(--dur-1) var(--ease);
}
.song-item:hover :deep(.quick-play),
.song-item:focus-within :deep(.quick-play),
.song-item.active :deep(.quick-play) {
  opacity: 1;
}
/* 无悬停设备上不能藏按钮，否则等于没有这个功能 */
@media (hover: none) {
  .song-item :deep(.quick-play) {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .song-bars i {
    height: 10px;
    animation: none;
  }
}
</style>

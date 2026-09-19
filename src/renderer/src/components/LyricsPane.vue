<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { demoLyrics } from '../data/catalog'
import { parseLrc, distributeWords, emptyLyrics } from '../services/lrc'
import * as playerStore from '../stores/player'
import { customLyrics } from '../stores/library'
import type { Track } from '../types/music'

/**
 * 歌词面板：演示曲内置歌词 / 用户挂载歌词 / 本地 .lrc 侧车（主进程读取）/ 无歌词占位。
 * - 不传 track 时跟随当前播放曲目，进度实时高亮；
 * - 传 track 时作为"只看歌词"浏览（不改变播放），无进度高亮。
 * 自动滚动用 scrollTop 实现（不依赖 scrollIntoView），点击行跳转（仅当前播放曲目）。
 */

const props = defineProps<{ track?: Track; compact?: boolean }>()

const resolved = computed<Track | null>(() => props.track ?? playerStore.currentTrack.value)
const isLive = computed(() => resolved.value?.id === playerStore.currentId.value)

const lyrics = ref(emptyLyrics())
const loading = ref(false)
const listEl = ref<HTMLElement>()
const loadedFor = ref<string | null>(null)

const activeIndex = computed(() => {
  if (!isLive.value) return -1
  const positionMs = playerStore.position.value * 1000
  let index = -1
  for (let i = 0; i < lyrics.value.lines.length; i++) {
    if (lyrics.value.lines[i].time <= positionMs) index = i
    else break
  }
  return index
})

const visibleWindow = computed(() => {
  const index = activeIndex.value
  if (index < 0) return { start: 0, end: Math.min(7, lyrics.value.lines.length) }
  return { start: Math.max(0, index - 1), end: Math.min(lyrics.value.lines.length, index + 8) }
})

/** 卡拉OK：当前行内高亮的词下标（无逐字时间轴时为 -1） */
const activeWordIndex = computed(() => {
  if (!isLive.value || activeIndex.value < 0) return -1
  const line = lyrics.value.lines[activeIndex.value]
  if (!line.words?.length) return -1
  const pos = playerStore.position.value * 1000 - line.time
  let index = -1
  for (let i = 0; i < line.words.length; i++) {
    if (line.words[i].offset <= pos) index = i
    else break
  }
  return index
})

watch(activeIndex, (index) => {
  const element = listEl.value
  if (!element || index < 0) return
  const row = element.children[index + 1] as HTMLElement | undefined
  if (!row) return
  const target = row.offsetTop - element.clientHeight * 0.38
  element.scrollTo({ top: target, behavior: 'smooth' })
})

watch(
  () => resolved.value?.id,
  async (id, old) => {
    lyrics.value = emptyLyrics()
    loadedFor.value = null
    if (!id || old === id) return
    const track = resolved.value as Track | null
    if (!track) return

    // 1) 用户手动挂载的歌词（任意曲目，优先）
    const custom = customLyrics.value[id]
    if (custom) {
      lyrics.value = parseLrc(custom)
      loadedFor.value = id
      return
    }
    // 2) 演示曲内置歌词
    if (track.origin === 'demo') {
      const builtin = demoLyrics[id]
      if (builtin) {
        lyrics.value = parseLrc(
          builtin.lines.map(([time, text]) => `[${formatStamp(time)}]${text}`).join('\n'),
          true
        )
        lyrics.value.meta = builtin.meta
        // 演示曲无真实演唱：逐字时间按行间均匀分布（卡拉OK效果）
        const lines = lyrics.value.lines
        for (let i = 0; i < lines.length; i++) {
          const next = lines[i + 1]?.time ?? lines[i].time + 4200
          lines[i].words = distributeWords(lines[i], next - lines[i].time)
        }
        loadedFor.value = id
      }
      return
    }
    // 3) 本地 .lrc 侧车
    if (!track.lyricsPath) return
    loading.value = true
    try {
      const text = await window.shengyu.readLyrics(track.lyricsPath)
      if (text) {
        lyrics.value = parseLrc(text)
        loadedFor.value = id
      }
    } catch {
      /* 无歌词文件 */
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

function formatStamp(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(2)
  return `${String(minutes).padStart(2, '0')}:${seconds.padStart(5, '0')}`
}

const seekTo = (index: number): void => {
  if (!isLive.value) return
  const line = lyrics.value.lines[index]
  if (!line) return
  void playerStore.seek(line.time / 1000)
}
</script>

<template>
  <div class="lyrics-pane" :class="{ compact }">
    <div v-if="loading" class="lyrics-placeholder"><span class="spinner"></span> 正在读取歌词…</div>
    <div v-else-if="lyrics.lines.length" ref="listEl" class="lyrics-list">
      <div class="lyrics-head">
        <span class="section-kicker">{{ lyrics.demo ? '演示歌词 · 原创' : '歌词' }}</span>
        <h2>{{ lyrics.meta.ti || resolved?.title || '' }}</h2>
        <p>
          {{ lyrics.meta.ar }}<template v-if="lyrics.meta.al"> · {{ lyrics.meta.al }}</template>
        </p>
      </div>
      <button
        v-for="(line, index) in lyrics.lines"
        :key="index"
        :class="[
          'lyric-line',
          {
            active: index === activeIndex,
            dimmed: index < visibleWindow.start || index >= visibleWindow.end
          }
        ]"
        @click="seekTo(index)"
      >
        <template v-if="index === activeIndex && line.words?.length">
          <span
            v-for="(word, wordIndex) in line.words"
            :key="wordIndex"
            class="lyric-word"
            :class="{
              active: wordIndex === activeWordIndex,
              sung: wordIndex < activeWordIndex
            }"
            >{{ word.text }}</span
          >
        </template>
        <template v-else>{{ line.text || '♪' }}</template>
      </button>
      <div class="lyrics-foot"></div>
    </div>
    <div v-else class="lyrics-placeholder">
      <span class="lyric-note-icon">♪</span>
      <p>暂无歌词</p>
      <small v-if="resolved?.origin === 'local'"
        >把同名 .lrc 文件放在歌曲旁边，或点击下方「导入歌词」</small
      >
      <small v-else>点击下方「导入歌词」挂载一份 .lrc 文件</small>
    </div>
  </div>
</template>

<style scoped>
.lyrics-pane {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
/*
 * 上下渐隐只能用 mask：它淡到透明，才能同时适配播放页的模糊底与抽屉面板的实底，
 * 换成叠加渐变就会露出色块。
 *
 * 注意：不能写 scrollbar-width: none —— Chromium 一旦识别到该属性就会改用标准滚动条
 * 并整体忽略 ::-webkit-scrollbar，全局的「悬停才显示」逻辑在这里会失效。
 * 副作用是滚动条也落在 mask 的渐隐区内，滑块在列表两端会偏淡。
 */
.lyrics-list {
  height: 100%;
  padding: 60px 12px 40vh;
  overflow-y: auto;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 12%,
    #000 78%,
    transparent 100%
  );
  mask-image: linear-gradient(to bottom, transparent 0, #000 12%, #000 78%, transparent 100%);
}
.compact .lyrics-list {
  padding-top: 18px;
}
.lyrics-head {
  margin-bottom: 44px;
  text-align: center;
}
.compact .lyrics-head {
  margin-bottom: 28px;
}
.lyrics-head h2 {
  margin-top: 10px;
  color: var(--paper-100);
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.compact .lyrics-head h2 {
  font-size: 19px;
}
.lyrics-head p {
  margin-top: 6px;
  color: var(--text-dim);
  font-size: 11px;
}
.lyric-line {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border-radius: 10px;
  color: var(--text-dim);
  background: transparent;
  font-size: 16.5px;
  line-height: 1.7;
  text-align: center;
  transition:
    color 300ms ease,
    transform 300ms ease;
}
.compact .lyric-line {
  padding: 6px 10px;
  font-size: 15px;
}
.lyric-line:hover {
  color: var(--text-soft);
}
.lyric-line.active {
  color: var(--lyrics-color, var(--paper-100));
  font-weight: 650;
  transform: scale(1.06);
  text-shadow: 0 0 24px rgba(245, 241, 233, 0.18);
}
.lyric-word {
  transition: color 200ms ease;
}
/* 卡拉OK逐字：已唱 = 自定义歌词色，当前字 = 强调色加亮 */
.lyric-word.sung {
  color: var(--lyrics-color, var(--paper-100));
}
.lyric-word.active {
  color: var(--accent);
  font-weight: 700;
  text-shadow: 0 0 16px rgba(255, 111, 26, 0.45);
}
.lyric-line.dimmed {
  opacity: 0.58;
}
.lyrics-foot {
  height: 30vh;
}
.lyrics-placeholder {
  display: grid;
  height: 100%;
  place-items: center;
  align-content: center;
  color: var(--text-dim);
  text-align: center;
}
.lyric-note-icon {
  display: grid;
  width: 56px;
  height: 56px;
  margin-bottom: 14px;
  place-items: center;
  border: 1px solid var(--hairline);
  border-radius: 50%;
  color: var(--accent);
  font-size: 22px;
}
.lyrics-placeholder p {
  color: var(--paper-200);
  font-size: 14px;
}
.lyrics-placeholder small {
  max-width: 260px;
  margin-top: 8px;
  font-size: 10px;
  line-height: 1.7;
}
</style>

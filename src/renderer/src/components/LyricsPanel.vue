<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'
import LyricsPane from './LyricsPane.vue'
import * as playerStore from '../stores/player'
import { trackById, attachLyrics, clearLyrics, customLyrics } from '../stores/library'
import { lyricsTrackId } from '../stores/ui'
import type { Track } from '../types/music'

/**
 * 悬浮歌词面板：默认跟随正在播放的曲目；
 * 从曲目菜单打开时显示指定曲目的歌词（不改变播放，可挂载 .lrc）。
 */

const emit = defineEmits<{ close: [] }>()

const track = computed<Track | null>(() =>
  lyricsTrackId.value ? trackById(lyricsTrackId.value) ?? null : playerStore.currentTrack.value
)

const isLive = computed(() => track.value?.id === playerStore.currentId.value)
const hasCustom = computed(() =>
  track.value?.id ? Boolean(customLyrics.value[track.value.id]) : false
)

const importLyrics = async (): Promise<void> => {
  if (!track.value) return
  await attachLyrics(track.value.id)
}

const clearCustom = (): void => {
  if (track.value) clearLyrics(track.value.id)
}

const openDesktopLyrics = (): void => {
  void window.shengyu.enterDesktopLyrics()
}
</script>

<template>
  <aside class="lyrics-panel">
    <div class="queue-header">
      <div>
        <span class="section-kicker">{{ isLive ? '同步歌词' : '歌词浏览' }}</span>
        <h2>歌词</h2>
      </div>
      <button
        class="icon-button lyrics-close"
        aria-label="关闭歌词面板"
        title="关闭歌词面板"
        @pointerdown.stop="emit('close')"
        @click.stop="emit('close')"
      >
        <AppIcon name="close" :size="22" />
      </button>
    </div>

    <div v-if="track" class="lyrics-panel-track" :class="{ live: isLive }">
      <CoverArt :cover="track.cover" size="small" />
      <div class="lyrics-panel-copy">
        <span class="lyrics-playing-label">{{ isLive ? '正在播放' : '仅浏览歌词' }}</span>
        <strong>{{ track.title }}</strong>
        <small>{{ track.artist }}</small>
      </div>
    </div>

    <div class="lyrics-panel-body">
      <LyricsPane :track="track ?? undefined" compact />
    </div>

    <div class="lyrics-panel-actions">
      <button class="secondary-button" @click="importLyrics">
        <AppIcon name="file" :size="15" />{{
          hasCustom || track?.lyricsPath ? '更换歌词文件' : '导入 LRC 歌词'
        }}
      </button>
      <button class="secondary-button" title="在桌面显示悬浮歌词" @click="openDesktopLyrics">
        <AppIcon name="lyrics" :size="15" />桌面歌词
      </button>
      <button v-if="hasCustom" class="text-button danger-text" @click="clearCustom">
        移除歌词
      </button>
      <button
        class="lyrics-panel-close"
        @pointerdown.stop="emit('close')"
        @click.stop="emit('close')"
      >
        关闭 <AppIcon name="chevron-right" :size="14" />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.lyrics-panel {
  position: fixed;
  z-index: 20;
  top: 0;
  right: 0;
  bottom: 80px;
  display: flex;
  width: 420px;
  flex-direction: column;
  padding: 30px 24px 20px;
  border-left: 1px solid var(--line);
  background: var(--surface);
  box-shadow: -24px 0 60px rgba(0, 0, 0, 0.28);
  /* 显式退出任何窗口拖拽区，保证顶部关闭按钮一定能点到 */
  -webkit-app-region: no-drag;
}
.lyrics-panel-track {
  position: relative;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  margin-bottom: 6px;
  padding: 11px 12px;
  border: 1px solid var(--hairline);
  border-radius: 13px;
  background: var(--wash-1);
}
.lyrics-panel-track.live {
  border-color: rgba(255, 111, 26, 0.35);
  background: var(--accent-muted);
}
.lyrics-panel-track.live::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 3px;
  height: 26px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
  content: '';
  transform: translateY(-50%);
}
.lyrics-panel-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.lyrics-playing-label {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 650;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.lyrics-panel-track:not(.live) .lyrics-playing-label {
  color: var(--text-muted);
}
.lyrics-panel-copy strong {
  overflow: hidden;
  color: var(--paper-100);
  font-size: 14px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lyrics-panel-copy small {
  color: var(--text-dim);
  font-size: 10px;
}
.lyrics-panel-body {
  min-height: 0;
  flex: 1;
}
.lyrics-panel-actions {
  display: flex;
  gap: 14px;
  align-items: center;
  padding-top: 14px;
  border-top: 1px solid var(--hairline);
}
.lyrics-close {
  width: 44px;
  height: 44px;
  border: 1px solid var(--hairline);
  border-radius: 12px;
  color: var(--text-soft);
  background: var(--wash-1);
  transition:
    color 150ms ease,
    background 150ms ease,
    transform 150ms ease;
}
.lyrics-close:hover {
  color: #fffaf4;
  border-color: transparent;
  background: var(--accent);
  transform: scale(1.05);
}
.lyrics-close:active {
  transform: scale(0.92);
}
.lyrics-panel-close {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  height: 32px;
  margin-left: auto;
  padding: 0 12px;
  border: 1px solid var(--hairline);
  border-radius: 9px;
  color: var(--text-soft);
  background: var(--wash-1);
  font-size: 11px;
  transition:
    color 150ms ease,
    background 150ms ease;
}
.lyrics-panel-close:hover {
  color: var(--paper-100);
  background: var(--wash-3);
}
.text-button.danger-text {
  color: #d8766a;
}
.text-button.danger-text:hover {
  color: #ff8d7d;
}
</style>

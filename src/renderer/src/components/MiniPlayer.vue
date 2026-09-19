<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'
import type { PlayerSyncPayload } from '@shared/ipc'
import type { CoverSpec } from '../types/music'

/**
 * 迷你播放器窗口（?mini=1 独立窗口）：
 * 状态由主窗口经主进程广播（player:sync），控制指令回发主进程再广播。
 */

const state = ref<PlayerSyncPayload | null>(null)

const cover = computed<string | null>(() => state.value?.cover ?? null)
const coverSpec = computed<CoverSpec>(() =>
  (cover.value ?? '').startsWith('shengyu-media:')
    ? { kind: 'url', url: cover.value as string }
    : {
        kind: 'variant',
        variant: (cover.value || 'ember') as CoverSpec extends {
          kind: 'variant'
          variant: infer V
        }
          ? V
          : never
      }
)

const progressPct = computed(() => {
  const duration = state.value?.duration ?? 0
  const position = state.value?.position ?? 0
  return duration > 0 ? Math.min(100, (position / duration) * 100) : 0
})

const unsubscribe = window.shengyu.onPlayerSync((payload) => {
  state.value = payload
})

const command = (name: 'play-pause' | 'next' | 'previous'): void => {
  window.shengyu.sendPlayerCommand(name)
}

const exitMini = (): void => {
  void window.shengyu.exitMini()
}

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

onBeforeUnmount(() => unsubscribe())
</script>

<template>
  <div class="mini-player">
    <div class="mini-cover">
      <CoverArt :cover="coverSpec" size="small" :rotating="state?.isPlaying ?? false" />
    </div>
    <div class="mini-body">
      <div class="mini-drag"></div>
      <strong>{{ state?.title ?? '声屿音乐' }}</strong>
      <small>
        <span v-if="state?.origin === 'radio'" class="mini-live">● LIVE</span>
        {{ state?.artist ?? '迷你播放器' }}
      </small>
      <div class="mini-controls">
        <button class="icon-button subtle" aria-label="上一首" @click="command('previous')">
          <AppIcon name="previous" :size="17" />
        </button>
        <button
          class="mini-play"
          :aria-label="state?.isPlaying ? '暂停' : '播放'"
          @click="command('play-pause')"
        >
          <AppIcon :name="state?.isPlaying ? 'pause' : 'play'" :size="17" :stroke-width="2.2" />
        </button>
        <button class="icon-button subtle" aria-label="下一首" @click="command('next')">
          <AppIcon name="next" :size="17" />
        </button>
      </div>
      <div class="mini-progress">
        <span>{{ formatTime(state?.position ?? 0) }}</span>
        <i class="mini-progress-track"><i :style="{ width: `${progressPct}%` }"></i></i
        ><span>{{ state?.origin === 'radio' ? '直播' : formatTime(state?.duration ?? 0) }}</span>
      </div>
    </div>
    <div class="mini-side">
      <button
        class="icon-button subtle"
        aria-label="展开主窗口"
        title="展开主窗口"
        @click="exitMini"
      >
        <AppIcon name="maximize" :size="14" />
      </button>
      <button class="icon-button subtle" aria-label="退出迷你模式" title="退出" @click="exitMini">
        <AppIcon name="close" :size="14" />
      </button>
    </div>
  </div>
</template>

<style>
/* 迷你窗口覆盖全局最小尺寸约束：主界面要求 980×680，迷你窗只有 380×190 */
html,
body {
  margin: 0;
  padding: 0;
  min-width: 0 !important;
  min-height: 0 !important;
  overflow: hidden;
  background: transparent !important;
}
#app {
  width: 100%;
  height: 100%;
  min-width: 0 !important;
  min-height: 0 !important;
}
</style>

<style scoped>
.mini-player {
  position: relative;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
  color: var(--paper-100);
  background: var(--surface);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  -webkit-app-region: drag;
}
.mini-player button {
  -webkit-app-region: no-drag;
}
.mini-cover .cover-art {
  width: 64px;
  height: 64px;
  border-radius: 12px;
}
.mini-body {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.mini-body strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-body small {
  display: flex;
  gap: 6px;
  align-items: center;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-live {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 700;
}
.mini-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
}
.mini-play {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: #fffaf4;
  background: var(--accent);
  cursor: pointer;
  transition: transform 140ms ease;
}
.mini-play:hover {
  transform: scale(1.08);
}
.mini-progress {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 26px;
  gap: 6px;
  align-items: center;
  margin-top: 6px;
}
.mini-progress span {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 7.5px;
  text-align: center;
}
.mini-progress-track {
  height: 3px;
  border-radius: 3px;
  background: var(--control);
  overflow: hidden;
}
.mini-progress-track i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
}
.mini-side {
  display: flex;
  gap: 2px;
  flex-direction: column;
}
</style>

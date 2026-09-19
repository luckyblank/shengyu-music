<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'
import LyricsPane from './LyricsPane.vue'
import Visualizer from './Visualizer.vue'
import WindowControls from './WindowControls.vue'
import * as playerStore from '../stores/player'
import * as uiStore from '../stores/ui'
import { likedIds, toggleLike } from '../stores/library'

const { currentTrack, currentId, isPlaying, liveSignal } = playerStore

const mode = ref<'lyrics' | 'visualizer'>('lyrics')

const coverVariant = computed(() => {
  const track = currentTrack.value
  if (!track) return 'ember'
  return track.cover.kind === 'variant' ? track.cover.variant : 'ember'
})

const liked = computed(() => (currentId.value ? likedIds.value.has(currentId.value) : false))

defineEmits<{ close: [] }>()
</script>

<template>
  <div class="now-playing-view" :class="`np-${coverVariant}`">
    <div class="np-blur-bg"></div>

    <header class="np-topbar">
      <button class="np-close" aria-label="收起播放页" @click="$emit('close')">
        <AppIcon name="chevron-down" :size="22" />
      </button>
      <div class="np-mode-label"><span class="np-mode-dot"></span>唱片播放</div>
      <div class="np-chrome">
        <button
          class="np-theme-toggle"
          :aria-label="uiStore.theme.value === 'dark' ? '切换到晨雾主题' : '切换到深海主题'"
          @click="uiStore.toggleTheme()"
        >
          <AppIcon :name="uiStore.theme.value === 'dark' ? 'sun' : 'moon'" :size="17" />
        </button>
        <WindowControls />
      </div>
    </header>

    <div class="np-body">
      <section class="np-art-zone">
        <div class="np-disc-stage" :class="{ spinning: isPlaying }">
          <div class="np-glow"></div>
          <div class="np-vinyl"></div>
          <div class="np-label">
            <CoverArt :cover="currentTrack?.cover" size="large" />
          </div>
          <div class="np-spindle"></div>
          <div class="np-tonearm" :class="{ engaged: isPlaying }">
            <span class="np-tonearm-pivot"><i></i></span>
            <span class="np-tonearm-arm"></span>
            <span class="np-tonearm-head"></span>
          </div>
        </div>
        <div class="np-art-caption">
          <span class="np-signal"><i></i>{{ isPlaying ? 'STEREO SIGNAL' : 'READY' }}</span>
          <span>{{ currentTrack?.origin === 'radio' ? 'LIVE STREAM' : '33⅓ RPM' }}</span>
        </div>
      </section>

      <section class="np-side-zone">
        <div class="np-copy">
          <span class="section-kicker">
            <AppIcon name="spark" :size="13" /> NOW PLAYING
            <span v-if="currentTrack?.origin === 'local'" class="np-format">{{
              currentTrack.format
            }}</span>
          </span>
          <h1>{{ currentTrack?.title ?? '未在播放' }}</h1>
          <p>
            {{ currentTrack?.artist ?? '' }}
            <template v-if="currentTrack?.album"> · {{ currentTrack.album }}</template>
          </p>
          <div class="np-actions">
            <button
              class="np-action-button"
              :class="{ liked }"
              @click="currentId && toggleLike(currentId)"
            >
              <AppIcon name="heart" :size="16" />{{ liked ? '已收藏' : '收藏' }}
            </button>
            <button class="np-action-button" @click="mode = 'visualizer'">
              <AppIcon name="equalizer" :size="16" />实时频谱
            </button>
          </div>
        </div>

        <div class="np-tabs" role="tablist" aria-label="播放详情">
          <button :class="{ active: mode === 'lyrics' }" @click="mode = 'lyrics'">歌词</button>
          <button :class="{ active: mode === 'visualizer' }" @click="mode = 'visualizer'">
            声波
          </button>
          <span>沉浸模式</span>
        </div>

        <div class="np-content-zone">
          <template v-if="mode === 'lyrics'">
            <LyricsPane compact />
          </template>
          <template v-else>
            <div class="np-visualizer-zone">
              <div class="np-visualizer-label">
                <span class="section-kicker">实时频谱</span>
                <small>{{ liveSignal ? 'AUDIO INPUT' : 'AMBIENT MODE' }}</small>
              </div>
              <div class="np-visualizer">
                <Visualizer :bars="72" :bar-width="3" :gap="4" :smoothing="0.45" />
              </div>
              <p class="np-visualizer-note">
                {{ liveSignal ? '来自音频分析器的实时信号' : '当前来源无分析器信号，展示呼吸波形' }}
              </p>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.now-playing-view {
  position: fixed;
  z-index: 30;
  inset: 0 0 84px;
  overflow: hidden;
  color: var(--paper-100);
  background: linear-gradient(
      120deg,
      color-mix(in srgb, var(--ink-950) 86%, transparent),
      var(--ink-950)
    ),
    var(--ink-950);
  animation: np-enter 380ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes np-enter {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.np-blur-bg {
  position: absolute;
  inset: -80px;
  opacity: 0.33;
  filter: blur(110px) saturate(1.08);
  pointer-events: none;
}
.np-ember .np-blur-bg {
  background: radial-gradient(circle at 30% 40%, rgba(239, 107, 79, 0.5), transparent 45%),
    radial-gradient(circle at 70% 70%, rgba(185, 59, 48, 0.35), transparent 50%);
}
.np-tide .np-blur-bg {
  background: radial-gradient(circle at 30% 40%, rgba(60, 156, 171, 0.45), transparent 45%),
    radial-gradient(circle at 70% 70%, rgba(35, 98, 118, 0.4), transparent 50%);
}
.np-moss .np-blur-bg {
  background: radial-gradient(circle at 30% 40%, rgba(151, 168, 109, 0.4), transparent 45%),
    radial-gradient(circle at 70% 70%, rgba(83, 100, 64, 0.4), transparent 50%);
}
.np-violet .np-blur-bg {
  background: radial-gradient(circle at 30% 40%, rgba(138, 124, 165, 0.45), transparent 45%),
    radial-gradient(circle at 70% 70%, rgba(85, 77, 114, 0.4), transparent 50%);
}
.np-sand .np-blur-bg {
  background: radial-gradient(circle at 30% 40%, rgba(213, 170, 114, 0.4), transparent 45%),
    radial-gradient(circle at 70% 70%, rgba(156, 112, 79, 0.4), transparent 50%);
}
.np-night .np-blur-bg {
  background: radial-gradient(circle at 30% 40%, rgba(107, 121, 142, 0.4), transparent 45%),
    radial-gradient(circle at 70% 70%, rgba(49, 59, 76, 0.45), transparent 50%);
}
.np-topbar {
  position: absolute;
  z-index: 5;
  top: 0;
  right: 0;
  left: 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 68px;
  padding: 0 22px 0 28px;
  -webkit-app-region: drag;
}
.np-close,
.np-theme-toggle {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 11px;
  color: var(--text-muted);
  background: var(--wash-1);
  -webkit-app-region: no-drag;
  transition:
    color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}
.np-close:hover,
.np-theme-toggle:hover {
  color: var(--accent);
  background: var(--accent-muted);
}
.np-close:hover {
  transform: translateY(2px);
}
.np-mode-label {
  display: inline-flex;
  gap: 9px;
  align-items: center;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.14em;
}
.np-mode-dot {
  width: 8px;
  height: 8px;
  border: 2px solid var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 4px var(--accent-muted);
}
.np-chrome {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-self: end;
  -webkit-app-region: no-drag;
}
.np-body {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(360px, 0.92fr) minmax(420px, 1.08fr);
  grid-template-rows: minmax(0, 1fr);
  width: min(1260px, 100%);
  height: 100%;
  margin: 0 auto;
  padding: 78px 48px 24px;
}
.np-art-zone {
  position: relative;
  display: flex;
  min-height: 0;
  align-items: center;
  justify-content: safe center;
  flex-direction: column;
  gap: 22px;
  padding: 12px 64px 8px 12px;
  overflow-y: auto;
  overflow-x: hidden;
  /* 不写 scrollbar-width: none —— 那会让全局的「悬停才显示滚动条」失效 */
}
.np-disc-stage {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  width: min(54vh, 430px, 38vw);
  max-width: 100%;
  aspect-ratio: 1;
  place-items: center;
  animation: np-cover-in 520ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes np-cover-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.np-glow {
  position: absolute;
  inset: -9%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--accent) 30%, transparent),
    transparent 64%
  );
  filter: blur(34px);
  animation: np-glow-breathe 5s ease-in-out infinite alternate;
}
@keyframes np-glow-breathe {
  to {
    opacity: 0.55;
    transform: scale(1.1);
  }
}
.np-vinyl {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 50%;
  background: radial-gradient(circle, #111618 0 13%, transparent 13.3%),
    repeating-radial-gradient(circle, #111516 0 2px, #202627 2.8px 4px);
  box-shadow:
    0 26px 60px rgba(0, 0, 0, 0.42),
    0 0 0 18px color-mix(in srgb, var(--surface-solid) 72%, transparent),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  animation: np-vinyl-spin 14s linear infinite;
  animation-play-state: paused;
}
.np-vinyl::after {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(
    115deg,
    transparent 30%,
    rgba(255, 255, 255, 0.07) 45%,
    transparent 60%
  );
  content: '';
}
.np-disc-stage.spinning .np-vinyl {
  animation-play-state: running;
}
@keyframes np-vinyl-spin {
  to {
    transform: rotate(360deg);
  }
}
.np-label {
  position: relative;
  z-index: 1;
  width: 48%;
  aspect-ratio: 1;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.07);
  animation: np-label-spin 14s linear infinite;
  animation-play-state: paused;
}
.np-disc-stage.spinning .np-label {
  animation-play-state: running;
}
@keyframes np-label-spin {
  to {
    transform: rotate(360deg);
  }
}
.np-label :deep(.cover-art) {
  width: 100%;
  border-radius: 50%;
  box-shadow: none;
}
.np-spindle {
  position: absolute;
  z-index: 3;
  width: 13px;
  height: 13px;
  border: 3px solid #dfe7e5;
  border-radius: 50%;
  background: #7d8c8a;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.np-tonearm {
  position: absolute;
  z-index: 4;
  top: -14%;
  right: -12%;
  width: 58%;
  height: 50%;
  pointer-events: none;
  transform: rotate(-11deg);
  transform-origin: 82% 8%;
  transition: transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
}
.np-tonearm.engaged {
  transform: rotate(3deg);
}
.np-tonearm-pivot {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface-solid) 80%, #000 20%);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.3);
}
.np-tonearm-pivot i {
  width: 18px;
  height: 18px;
  border: 5px solid #eef3f2;
  border-radius: 50%;
  background: #909d9b;
}
.np-tonearm-arm {
  position: absolute;
  top: 26px;
  right: 39px;
  width: 78%;
  height: 9px;
  border-radius: 99px;
  background: linear-gradient(#f7faf9, #aeb9b7);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.24);
  transform: rotate(-27deg);
  transform-origin: right center;
}
.np-tonearm-head {
  position: absolute;
  bottom: 11%;
  left: -2%;
  width: 34px;
  height: 18px;
  border-radius: 4px 8px 8px 4px;
  background: #f3f7f6;
  box-shadow: 0 5px 12px rgba(0, 0, 0, 0.3);
  transform: rotate(18deg);
}
.np-art-caption {
  display: flex;
  gap: 22px;
  align-items: center;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.12em;
}
.np-signal {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.np-signal i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 10px color-mix(in srgb, var(--success) 70%, transparent);
}
.np-copy {
  width: 100%;
  padding: 18px 20px 24px 22px;
}
.np-copy h1 {
  margin-top: 12px;
  color: var(--paper-100);
  font-size: clamp(28px, 3vw, 44px);
  font-weight: 650;
  letter-spacing: -0.045em;
  text-wrap: balance;
}
.np-copy p {
  margin-top: 9px;
  color: var(--text-muted);
  font-size: 13px;
}
.np-format {
  padding: 2px 6px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  font-size: 8px;
  letter-spacing: 0.06em;
}
.np-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}
.np-action-button {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--wash-1);
  font-size: 10px;
  transition: 160ms ease;
}
.np-action-button:hover {
  color: var(--paper-100);
  background: var(--wash-2);
  transform: translateY(-1px);
}
.np-action-button.liked,
.np-action-button.liked .app-icon {
  color: var(--accent);
  fill: currentColor;
}
.np-side-zone {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto 42px minmax(0, 1fr);
  border-left: 1px solid var(--hairline);
}
.np-tabs {
  display: flex;
  gap: 22px;
  align-items: center;
  margin: 0 20px 0 22px;
  border-bottom: 1px solid var(--hairline);
}
.np-tabs button {
  position: relative;
  height: 42px;
  padding: 0;
  color: var(--text-dim);
  background: transparent;
  font-size: 12px;
}
.np-tabs button.active {
  color: var(--paper-100);
  font-weight: 650;
}
.np-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
  content: '';
}
.np-tabs > span {
  margin-left: auto;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
}
.np-content-zone {
  min-height: 0;
  padding: 0 8px 0 10px;
  overflow: hidden;
}
.np-content-zone :deep(.lyrics-head) {
  display: none;
}
.np-content-zone :deep(.lyrics-list) {
  padding-top: 34px;
  text-align: left;
}
.np-content-zone :deep(.lyric-line) {
  padding-left: 16px;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1.85;
  text-align: left;
  transform-origin: left center;
}
.np-content-zone :deep(.lyric-line.dimmed) {
  opacity: 0.72;
}
.np-content-zone :deep(.lyric-line.active) {
  color: var(--lyrics-color, var(--paper-100));
  transform: scale(1.04);
}
.np-visualizer-zone {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 0 30px 20px;
}
.np-visualizer-label {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
}
.np-visualizer-label small {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
}
.np-visualizer {
  width: 100%;
  height: 220px;
  margin-top: 40px;
}
.np-visualizer-note {
  margin-top: 30px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
}

@media (max-width: 1080px) {
  .np-body {
    grid-template-columns: minmax(320px, 0.88fr) minmax(390px, 1.12fr);
    padding-inline: 28px;
  }
  .np-art-zone {
    padding-right: 42px;
  }
  .np-disc-stage {
    width: min(48vh, 350px, 35vw);
  }
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { engine } from '../services/audio-engine'
import * as playerStore from '../stores/player'
import { toggleLike, likedIds } from '../stores/library'

/**
 * 生成式 MV：全屏可视化音乐视频。
 * 四个场景（霓虹波 / 极光 / 脉冲环 / 波形）全部由真实音频频谱实时驱动，
 * 每 20 秒自动换场，也可点击切换；任何曲目（演示/本地/在线）都能"有 MV"。
 */

type Scene = 'neon' | 'aurora' | 'rings' | 'wave'

const emit = defineEmits<{ close: [] }>()
const canvas = ref<HTMLCanvasElement>()
const scene = ref<Scene>('neon')
const sceneIndex = ref(0)

const scenes: Scene[] = ['neon', 'aurora', 'rings', 'wave']
const sceneLabels: Record<Scene, string> = {
  neon: '霓虹波',
  aurora: '极光',
  rings: '脉冲环',
  wave: '声波'
}

const liked = computed(() =>
  playerStore.currentId.value ? likedIds.value.has(playerStore.currentId.value) : false
)

let spectrum: number[] = new Array(64).fill(0)
let raf = 0
let width = 0
let height = 0
let phase = 0

const unsubscribe = engine.on('spectrum', (bins) => {
  spectrum = bins
})

const cycleScene = (): void => {
  sceneIndex.value = (sceneIndex.value + 1) % scenes.length
  scene.value = scenes[sceneIndex.value]
}

function resize(): void {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = Math.max(1, Math.round(rect.width * dpr))
  height = Math.max(1, Math.round(rect.height * dpr))
  canvas.value.width = width
  canvas.value.height = height
}

const bass = (): number => {
  let sum = 0
  for (let i = 0; i < 8; i++) sum += spectrum[i] ?? 0
  return sum / 8
}
const mid = (): number => {
  let sum = 0
  for (let i = 8; i < 32; i++) sum += spectrum[i] ?? 0
  return sum / 24
}
const high = (): number => {
  let sum = 0
  for (let i = 32; i < 64; i++) sum += spectrum[i] ?? 0
  return sum / 32
}

function draw(): void {
  raf = requestAnimationFrame(draw)
  const element = canvas.value
  if (!element) return
  const ctx = element.getContext('2d')
  if (!ctx) return
  phase += 0.016
  const playing = playerStore.isPlaying.value
  const b = playing ? bass() : 0.06 + 0.04 * Math.sin(phase * 1.7)
  const m = playing ? mid() : 0.05
  const h = playing ? high() : 0.03

  ctx.fillStyle = 'rgba(6, 12, 14, 0.28)'
  ctx.fillRect(0, 0, width, height)

  if (scene.value === 'neon') {
    // 霓虹波：三层正弦波纹，频率与颜色随频谱
    for (let layer = 0; layer < 3; layer++) {
      const amp = height * (0.05 + 0.1 * (layer === 0 ? b : layer === 1 ? m : h))
      const yBase = height * (0.3 + layer * 0.18)
      const speed = 1.4 + layer * 0.7
      ctx.beginPath()
      for (let x = 0; x <= width; x += 4) {
        const t = x / width
        const y =
          yBase +
          Math.sin(t * Math.PI * (2 + layer) + phase * speed) * amp +
          Math.sin(t * Math.PI * 9 + phase * speed * 1.7) * amp * 0.35
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      const hue = layer === 0 ? 355 + b * 40 : layer === 1 ? 190 + m * 40 : 265
      ctx.strokeStyle = `hsla(${hue}, 85%, ${58 + layer * 8}%, 0.85)`
      ctx.lineWidth = 2 + layer
      ctx.stroke()
    }
    // 粒子
    const count = Math.floor(14 + b * 60)
    for (let i = 0; i < count; i++) {
      const sx = ((i * 2654435761) % 1000) / 1000
      const sy = ((i * 40503) % 1000) / 1000
      const px = sx * width
      const py = sy * height
      const pr = 1 + h * 3
      ctx.beginPath()
      ctx.arc(px, py, pr, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${355 + m * 40}, 90%, 70%, 0.7)`
      ctx.fill()
    }
  } else if (scene.value === 'aurora') {
    // 极光：竖向流动光带，亮度与频谱联动
    const bands = 7
    for (let i = 0; i < bands; i++) {
      const cx = width * ((i + 0.5) / bands) + Math.sin(phase * 0.4 + i) * width * 0.04
      const bandH = height * (0.35 + 0.5 * spectrum[i * 8 + 4])
      const grad = ctx.createLinearGradient(0, height * 0.1, 0, height)
      const hue = 150 + i * 18
      grad.addColorStop(0, `hsla(${hue}, 80%, 60%, 0)`)
      grad.addColorStop(0.45, `hsla(${hue}, 85%, 62%, ${0.1 + spectrum[i * 8 + 4] * 0.35})`)
      grad.addColorStop(0.55, `hsla(${hue + 25}, 80%, 70%, ${0.1 + spectrum[i * 8 + 6] * 0.35})`)
      grad.addColorStop(1, `hsla(${hue + 40}, 75%, 60%, 0)`)
      ctx.beginPath()
      ctx.moveTo(cx - bandH * 0.28, height)
      ctx.quadraticCurveTo(cx, height * 0.25, cx + bandH * 0.28, height)
      ctx.lineTo(cx + bandH * 0.32, height)
      ctx.quadraticCurveTo(cx, height * 0.32, cx - bandH * 0.32, height)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
    }
    // 星点
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 127 + 7) % 997) / 997
      const sy = ((i * 311 + 3) % 997) / 997
      ctx.beginPath()
      ctx.arc(sx * width, sy * height * 0.7, 0.8 + h * 1.6, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(230, 244, 255, ${0.25 + h * 0.5})`
      ctx.fill()
    }
  } else if (scene.value === 'rings') {
    // 脉冲环：以节拍向外扩散的圆环
    const cx = width / 2
    const cy = height / 2
    const rings = 6
    for (let i = 0; i < rings; i++) {
      const t = (phase * 0.5 + i / rings) % 1
      const r = (t * width * 0.55 + width * 0.05) * (1 + b * 0.6)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = `hsla(${190 + i * 22}, 85%, 60%, ${(1 - t) * 0.5})`
      ctx.lineWidth = 2 + (1 - t) * 3
      ctx.stroke()
    }
    // 中心光核随节拍
    const coreR = width * (0.05 + b * 0.2)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2)
    grad.addColorStop(0, 'rgba(255, 220, 220, 0.9)')
    grad.addColorStop(1, 'rgba(236, 65, 65, 0)')
    ctx.beginPath()
    ctx.arc(cx, cy, coreR * 2, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
  } else {
    // 声波：底部大波形 + 镜像
    const rows = 2
    for (let row = 0; row < rows; row++) {
      const yBase = row === 0 ? height * 0.42 : height * 0.58
      const dir = row === 0 ? -1 : 1
      ctx.beginPath()
      for (let x = 0; x <= width; x += 3) {
        const bin = Math.floor((x / width) * 64)
        const v = (spectrum[bin] ?? 0) * (0.35 + row * 0.25)
        const wave = Math.sin(x * 0.012 + phase * 3) * 6
        const y = yBase + dir * (v * height * 0.32 + wave)
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      const hue = row === 0 ? 355 : 195
      ctx.strokeStyle = `hsla(${hue}, 85%, 62%, 0.9)`
      ctx.lineWidth = 2.5
      ctx.stroke()
    }
    // 频谱柱群
    const barCount = 64
    const barW = width / barCount
    for (let i = 0; i < barCount; i++) {
      const v = spectrum[i] ?? 0
      const bh = v * height * 0.2
      ctx.fillStyle = `hsla(${195 + i * 1.2}, 80%, ${45 + v * 30}%, 0.75)`
      ctx.fillRect(i * barW + 1, height - bh, barW - 2, bh)
    }
  }
}

let autoSwitchTimer: number | undefined
onMounted(() => {
  resize()
  const observer = new ResizeObserver(resize)
  if (canvas.value) observer.observe(canvas.value)
  draw()
  autoSwitchTimer = window.setInterval(cycleScene, 20000)
  onBeforeUnmount(() => {
    observer.disconnect()
    cancelAnimationFrame(raf)
    window.clearInterval(autoSwitchTimer)
    unsubscribe()
  })
})
</script>

<template>
  <div class="mv-view" @click.self="emit('close')">
    <canvas ref="canvas" class="mv-canvas" aria-hidden="true"></canvas>

    <header class="mv-topbar">
      <span class="mv-brand">声屿 MV</span>
      <div class="mv-scene-tabs">
        <button
          v-for="item in scenes"
          :key="item"
          :class="{ active: scene === item }"
          @click="scene = item"
        >
          {{ sceneLabels[item] }}
        </button>
      </div>
      <button class="icon-button" aria-label="关闭 MV" @click="emit('close')">
        <AppIcon name="close" :size="20" />
      </button>
    </header>

    <div class="mv-track-info">
      <strong>{{ playerStore.currentTrack.value?.title ?? '未在播放' }}</strong>
      <span>{{ playerStore.currentTrack.value?.artist ?? '' }}</span>
      <button
        class="icon-button subtle"
        :class="{ active: liked }"
        :aria-label="liked ? '取消收藏' : '收藏'"
        @click="playerStore.currentId.value && toggleLike(playerStore.currentId.value)"
      >
        <AppIcon name="heart" :size="19" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.mv-view {
  position: fixed;
  z-index: 35;
  inset: 0 0 80px;
  overflow: hidden;
  background: #060c0e;
  cursor: default;
}
.mv-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.mv-topbar {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  left: 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 64px;
  padding: 0 22px;
}
.mv-brand {
  color: rgba(255, 255, 255, 0.85);
  font-family: var(--font-display);
  font-size: 16px;
  letter-spacing: 0.14em;
}
.mv-scene-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
}
.mv-scene-tabs button {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.66);
  background: transparent;
  font-size: 11.5px;
  transition:
    color 160ms ease,
    background 160ms ease;
}
.mv-scene-tabs button.active {
  color: #ffffff;
  background: var(--accent);
}
.mv-topbar .icon-button {
  justify-self: end;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
}
.mv-topbar .icon-button:hover {
  background: var(--accent);
}
.mv-track-info {
  position: absolute;
  z-index: 2;
  bottom: 30px;
  left: 32px;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(8, 14, 16, 0.5);
  backdrop-filter: blur(14px);
}
.mv-track-info strong {
  color: #ffffff;
  font-size: 15px;
}
.mv-track-info span {
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
}
.mv-track-info .icon-button {
  color: rgba(255, 255, 255, 0.7);
}
.mv-track-info .icon-button.active {
  color: var(--accent);
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { engine } from '../services/audio-engine'
import * as player from '../stores/player'

/**
 * 实时频谱可视化。
 * 有真实分析器信号时渲染引擎推送的 64 根频谱柱；
 * 本地文件降级（跨源静音）或未播放时退化为确定性的呼吸波形，
 * 保证视觉上永远"活着"但不做假数据伪装成真实频谱。
 */

const props = withDefaults(
  defineProps<{
    bars?: number
    /** 柱宽像素，小图用更细的柱 */
    barWidth?: number
    gap?: number
    muted?: boolean
    /** 动画目标（防止小图重绘抖动） */
    smoothing?: number
  }>(),
  { bars: 64, barWidth: 2, gap: 2, muted: false, smoothing: 0.35 }
)

const canvas = ref<HTMLCanvasElement>()
const levels = ref<number[]>(new Array(props.bars).fill(0.05))
let spectrum: number[] = new Array(64).fill(0)
let raf = 0
let width = 0
let height = 0
let seed = 0
const count = props.bars

const unsubscribe = engine.on('spectrum', (bins) => {
  spectrum = bins
})

function resize(): void {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = Math.max(1, Math.round(rect.width * dpr))
  height = Math.max(1, Math.round(rect.height * dpr))
  canvas.value.width = width
  canvas.value.height = height
}

function draw(): void {
  raf = requestAnimationFrame(draw)
  const element = canvas.value
  if (!element) return
  const ctx = element.getContext('2d')
  if (!ctx) return

  const pseudo = !player.isPlaying.value || !player.liveSignal.value
  const time = performance.now() / 1000

  let target: number[]
  if (pseudo) {
    // 确定性呼吸波形：由当前进度与曲目种子调制，重入同一进度视觉一致
    const phase = time * 0.9
    target = new Array(count)
    const base = player.position.value
    const seeded = (i: number): number => {
      const t = seed * 0.618 + i * 0.37
      const s = Math.sin(t * 12.9898) * 43758.5453
      return s - Math.floor(s)
    }
    for (let i = 0; i < count; i++) {
      const envelope = 0.24 + 0.76 * Math.abs(Math.sin((i / count) * Math.PI))
      const wave =
        0.5 + 0.5 * Math.sin(phase * 2.1 + i * 0.55 + base * 0.35) * (0.35 + 0.65 * seeded(i))
      target[i] = 0.06 + 0.34 * envelope * wave * (0.55 + 0.45 * Math.sin(phase * 0.7))
    }
  } else {
    target = new Array(count)
    const step = spectrum.length / count
    for (let i = 0; i < count; i++) {
      let max = 0
      const start = Math.floor(i * step)
      const end = Math.floor((i + 1) * step)
      for (let j = start; j < end; j++) max = Math.max(max, spectrum[j] ?? 0)
      // 频谱做对数感修正，小信号也能看清
      target[i] = Math.pow(max, 0.82)
    }
  }

  const k = props.smoothing
  for (let i = 0; i < count; i++) {
    levels.value[i] += (target[i] - levels.value[i]) * (pseudo ? 0.18 : k)
  }

  ctx.clearRect(0, 0, width, height)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const slot = width / count / dpr
  const barW = Math.min(props.barWidth, slot - 0.5)
  const offset = (slot - barW) / 2
  const active = player.isPlaying.value

  for (let i = 0; i < count; i++) {
    const level = active ? Math.max(0.03, levels.value[i]) : Math.max(0.02, levels.value[i] * 0.35)
    const h = Math.max(1.5, level * height)
    const x = (i * slot + offset) * dpr
    const y = (height - h) / 2
    const gradient = ctx.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, 'rgba(239, 107, 79, 0.85)')
    gradient.addColorStop(1, 'rgba(163, 181, 110, 0.85)')
    ctx.fillStyle = props.muted ? 'rgba(153, 153, 148, 0.5)' : gradient
    const radius = Math.min(barW, 2) * dpr
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath()
      ctx.roundRect(x, y, barW * dpr, h, radius)
      ctx.fill()
    } else {
      ctx.fillRect(x, y, barW * dpr, h)
    }
  }
}

const observer = new ResizeObserver(resize)

onMounted(() => {
  seed = Math.floor(Number(player.currentId.value ?? '1') % 97)
  resize()
  if (canvas.value) observer.observe(canvas.value)
  draw()
})

onBeforeUnmount(() => {
  observer.disconnect()
  cancelAnimationFrame(raf)
  unsubscribe()
})

watch(
  () => player.currentId.value,
  (id) => {
    seed = Math.floor(Number(id ?? '1') % 97)
  }
)
</script>

<template>
  <canvas ref="canvas" class="visualizer" aria-hidden="true"></canvas>
</template>

<style scoped>
.visualizer {
  display: block;
  width: 100%;
  height: 100%;
}
</style>

import type { Track } from '../types/music'
import { MediaSource } from './media-source'
import { SynthSource } from './synth-source'

/**
 * 播放引擎：唯一持有 AudioContext 的地方。
 *
 * 音频图（所有来源共用一条总线）：
 *   source ─→ bus ─→ EQ(5段) ─→ masterGain ─→ analyser ─→ destination
 *                                       └─→ 每帧推给频谱组件
 *
 * 状态变更全部通过 emit() 通知上层，引擎自身不含任何 Vue 依赖。
 */

export interface EngineSnapshot {
  currentId: string | null
  position: number
  duration: number
  volume: number
  muted: boolean
  isPlaying: boolean
  loading: boolean
  failed: boolean
  /** 当前来源是否有真实分析器信号（本地文件降级后为 false） */
  liveSignal: boolean
}

export interface EngineEvents {
  state: (snapshot: EngineSnapshot) => void
  ended: () => void
  error: (message: string) => void
  /** 分析器频率数据推送（64 根柱，0..1） */
  spectrum: (bins: number[]) => void
  rms: (level: number) => void
  /** 本地文件被检出静音降级 */
  degraded: () => void
}

export const EQ_BANDS = [
  { freq: 60, label: '60Hz' },
  { freq: 250, label: '250Hz' },
  { freq: 1000, label: '1kHz' },
  { freq: 4000, label: '4kHz' },
  { freq: 12000, label: '12kHz' }
] as const

export const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0],
  pop: [-1, 2, 3, 2, -1],
  rock: [4, 2, -1, 2, 4],
  vocal: [-1, -0.5, 3, 2, 1],
  night: [3, 1, -1, -2, -3]
}

/** 滑杆行程：±12dB 映射到 0..100。均衡器面板与设置页共用，
    两处各写一份换算迟早会在改行程时只改一处，导致同一条曲线两个数值 */
export const EQ_GAIN_DB = 12

export const gainToPct = (gain: number): number => ((gain + EQ_GAIN_DB) / (EQ_GAIN_DB * 2)) * 100

export const pctToGain = (pct: number): number =>
  Math.round(((pct / 100) * EQ_GAIN_DB * 2 - EQ_GAIN_DB) * 10) / 10

/** 音效预设（仿酷狗蝰蛇音效）：在 EQ 之后、分析器之前插入的效果链。 */
export type FxPreset = 'none' | 'live' | 'vocal' | 'bass' | '3d'

export const FX_PRESET_LABELS: Record<FxPreset, string> = {
  none: '关闭',
  live: '现场',
  vocal: '纯净人声',
  bass: '重低音',
  '3d': '3D环绕'
}

const FADE_IN_S = 0.12
const FADE_OUT_S = 0.05

export class AudioEngine {
  private ctx: AudioContext | null = null
  private bus: GainNode | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private eqFilters: BiquadFilterNode[] = []
  private source: SynthSource | MediaSource | null = null
  private currentTrack: Track | null = null

  private listeners: { [K in keyof EngineEvents]: Set<EngineEvents[K]> } = {
    state: new Set(),
    ended: new Set(),
    error: new Set(),
    spectrum: new Set(),
    rms: new Set(),
    degraded: new Set()
  }

  private volume = 0.68
  private muted = false
  private isPlaying = false
  private loading = false
  private failed = false
  private liveSignal = false
  private raf = 0
  private lastSpectrumPush = 0

  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]): () => void {
    this.listeners[event].add(listener)
    return () => {
      this.listeners[event].delete(listener)
    }
  }

  private emit<K extends keyof EngineEvents>(event: K, ...args: Parameters<EngineEvents[K]>): void {
    for (const listener of this.listeners[event]) {
      ;(listener as (...a: Parameters<EngineEvents[K]>) => void)(...args)
    }
  }

  /* ------------------------------ 基础设施 ------------------------------ */

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.bus = this.ctx.createGain()
      this.bus.gain.value = 0.9
      this.master = this.ctx.createGain()
      this.applyVolume()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.82

      this.bus.connect(this.master)
      for (const band of EQ_BANDS) {
        const filter = this.ctx.createBiquadFilter()
        filter.type = 'peaking'
        filter.frequency.value = band.freq
        filter.Q.value = band.freq < 200 ? 0.7 : 1.1
        filter.gain.value = 0
        this.eqFilters.push(filter)
      }
      let prev: AudioNode = this.master
      for (const filter of this.eqFilters) {
        prev.connect(filter)
        prev = filter
      }
      // 音效插入点：EQ 之后、分析器之前
      this.fxInsert = this.ctx.createGain()
      this.fxInsert.gain.value = 1
      prev.connect(this.fxInsert)
      this.fxInsert.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  get snapshot(): EngineSnapshot {
    return {
      currentId: this.currentTrack?.id ?? null,
      position: this.source ? this.source.position : 0,
      duration: this.currentTrack?.duration ?? 0,
      volume: this.volume,
      muted: this.muted,
      isPlaying: this.isPlaying,
      loading: this.loading,
      failed: this.failed,
      liveSignal: this.liveSignal
    }
  }

  private pushState(): void {
    this.emit('state', this.snapshot)
  }

  /* ------------------------------ 播放控制 ------------------------------ */

  async load(track: Track, position = 0): Promise<void> {
    this.loading = true
    this.failed = false
    this.pushState()

    try {
      await this.source?.dispose()
      const ctx = this.ensureContext()
      this.currentTrack = track

      if (track.origin !== 'demo') {
        const source = new MediaSource(track, {
          onEnded: () => this.emit('ended'),
          onDegraded: () => this.notifyDegraded()
        })
        await source.prepare((element) => {
          if (!this.ctx || !this.bus || !this.analyser) return null
          try {
            const node = this.ctx.createMediaElementSource(element)
            node.connect(this.bus)
            return {
              analyser: this.analyser,
              pullRms: () => this.pullRms()
            }
          } catch (error) {
            console.warn('[engine] createMediaElementSource 失败', error)
            return null
          }
        })
        this.source = source
        this.liveSignal = source.pullRms() !== null
        // 在线/无标签音源：从已加载的音频元素回写真实时长（曲目对象为响应式，UI 自动更新）。
        // 电台流 duration 为 Infinity，跳过回写
        if (track.origin !== 'radio' && track.duration <= 0) {
          const real = source.duration
          if (real > 0 && Number.isFinite(real)) track.duration = Math.round(real)
        }
      } else {
        const source = new SynthSource(ctx, this.bus as AudioNode, track)
        await source.prepare()
        this.source = source
        this.liveSignal = true
      }
    } catch (error) {
      console.error('[engine] load 抛出异常', error)
      this.failed = true
      this.loading = false
      this.pushState()
      this.emit('error', (error as Error).message)
      return
    }

    this.loading = false
    await this.seek(position, true)
    this.startRafLoop()
    this.pushState()
    console.log(
      `[engine] 已加载 ${track.title}（${
        track.origin === 'local'
          ? track.format
          : track.origin === 'remote'
            ? '在线音源'
            : track.origin === 'radio'
              ? '电台'
              : '合成音源'
      }）`
    )
  }

  async play(position?: number): Promise<void> {
    if (!this.source || !this.currentTrack) return
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const from = position ?? this.source.position

    try {
      await this.source.play(from)
      if (this.source instanceof SynthSource) {
        // 合成器在 play 内自建淡入
      } else {
        this.fadeIn()
        this.source.onPlaybackStarted()
      }
      this.isPlaying = true
      this.failed = false
      this.pushState()
      this.reportRmsLog()
    } catch (error) {
      this.emit('error', `无法播放：${(error as Error).message}`)
    }
  }

  async pause(): Promise<void> {
    if (!this.source) return
    if (this.source instanceof SynthSource) {
      this.source.pause()
    } else {
      this.fadeOut().catch(() => undefined)
      this.source.pause()
    }
    this.isPlaying = false
    this.pushState()
  }

  async toggle(): Promise<void> {
    if (this.isPlaying) await this.pause()
    else await this.play()
  }

  async seek(toSeconds: number, silent = false): Promise<void> {
    if (!this.source || !this.currentTrack) return
    const clamped = Math.max(0, Math.min(toSeconds, this.currentTrack.duration || toSeconds))
    await this.source.seek(clamped)
    if (!silent) this.pushState()
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value))
    if (this.volume > 0) this.muted = false
    this.applyVolume()
    this.pushState()
  }

  setMuted(value: boolean): void {
    this.muted = value
    this.applyVolume()
    this.pushState()
  }

  toggleMuted(): void {
    this.setMuted(!this.muted)
  }

  /** 每 5 秒在开发态打印一次 RMS，用于无音频设备时的链路验证。 */
  private rmsLogTimer: number | undefined
  private reportRmsLog(): void {
    if (!import.meta.env.DEV || this.rmsLogTimer) return
    this.rmsLogTimer = window.setInterval(() => {
      if (!this.isPlaying) return
      const rms = this.pullRms()
      console.log(`[engine] RMS=${rms === null ? 'null(降级)' : rms.toFixed(4)}`)
    }, 5000)
  }

  setEqualizer(enabled: boolean, gains: number[]): void {
    for (let i = 0; i < this.eqFilters.length; i++) {
      this.eqFilters[i].gain.setTargetAtTime(
        enabled ? gains[i] ?? 0 : 0,
        this.ctx?.currentTime ?? 0,
        0.05
      )
    }
  }

  /* ------------------------------ 音效链 ------------------------------ */

  private fxInsert: GainNode | null = null
  private fxNodes: AudioNode[] = []
  private fxPreset: FxPreset = 'none'

  /** 切换音效预设：拆除旧链，按预设重建 干声 + 效果 两条通路。 */
  setFx(preset: FxPreset): void {
    this.fxPreset = preset
    if (!this.ctx || !this.fxInsert || !this.analyser) return
    const now = this.ctx.currentTime

    for (const node of this.fxNodes) {
      try {
        node.disconnect()
      } catch {
        /* 已断开 */
      }
    }
    this.fxNodes = []
    try {
      this.fxInsert.disconnect()
    } catch {
      /* 已断开 */
    }

    if (preset === 'none') {
      this.fxInsert.connect(this.analyser)
      return
    }

    const dry = this.ctx.createGain()
    dry.gain.value = 1
    this.fxInsert.connect(dry)
    dry.connect(this.analyser)
    this.fxNodes.push(dry)

    if (preset === 'live' || preset === '3d') {
      // 现场/环绕：卷积混响（暖化后的噪声脉冲）
      const reverb = this.ctx.createConvolver()
      reverb.normalize = false
      const length = Math.floor(this.ctx.sampleRate * 1.8)
      const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate)
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel)
        let smoothed = 0
        for (let i = 0; i < length; i++) {
          smoothed += 0.12 * (Math.random() * 2 - 1 - smoothed)
          data[i] = smoothed * (1 - i / length) ** 2.4
        }
      }
      reverb.buffer = impulse
      const wet = this.ctx.createGain()
      wet.gain.setValueAtTime(0.0001, now)
      wet.gain.setTargetAtTime(preset === 'live' ? 0.5 : 0.35, now, 0.2)
      this.fxInsert.connect(reverb)
      reverb.connect(wet)
      wet.connect(this.analyser)
      this.fxNodes.push(reverb, wet)
    }

    if (preset === 'live' || preset === 'vocal' || preset === 'bass') {
      // 压缩器：让响度更饱满
      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -24
      comp.knee.value = 18
      comp.ratio.value = 5
      comp.attack.value = 0.004
      comp.release.value = 0.24
      dry.disconnect()
      this.fxInsert.connect(comp)
      comp.connect(this.analyser)
      this.fxNodes.push(comp)
    }

    if (preset === 'vocal') {
      // 纯净人声：切除低频杂讯 + 中频人声区增益
      const hp = this.ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 180
      const mid = this.ctx.createBiquadFilter()
      mid.type = 'peaking'
      mid.frequency.value = 2800
      mid.Q.value = 0.8
      mid.gain.value = 3.5
      this.fxInsert.connect(hp)
      hp.connect(mid)
      mid.connect(this.analyser)
      this.fxNodes.push(hp, mid)
    }

    if (preset === 'bass') {
      // 重低音：低频搁架提升 + 次低频共振峰
      const shelf = this.ctx.createBiquadFilter()
      shelf.type = 'lowshelf'
      shelf.frequency.value = 90
      shelf.gain.value = 7
      const punch = this.ctx.createBiquadFilter()
      punch.type = 'peaking'
      punch.frequency.value = 55
      punch.Q.value = 1.2
      punch.gain.value = 4
      this.fxInsert.connect(shelf)
      shelf.connect(punch)
      punch.connect(this.analyser)
      this.fxNodes.push(shelf, punch)
    }

    if (preset === '3d') {
      // 3D 环绕：慢速 LFO 驱动声像来回摆
      const panner = this.ctx.createStereoPanner()
      const lfo = this.ctx.createOscillator()
      lfo.frequency.value = 0.12
      const lfoGain = this.ctx.createGain()
      lfoGain.gain.value = 0.65
      lfo.connect(lfoGain)
      lfoGain.connect(panner.pan)
      lfo.start()
      this.fxInsert.connect(panner)
      panner.connect(this.analyser)
      this.fxNodes.push(lfo, lfoGain, panner)
    }
  }

  get currentFx(): FxPreset {
    return this.fxPreset
  }

  /* ------------------------------ 内部实现 ------------------------------ */

  private applyVolume(): void {
    if (!this.master || !this.ctx) return
    const target = this.muted ? 0 : this.volume
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02)
    // 直连模式（跨源降级/电台直连）的音源：音量直接作用在元素上
    if (this.source instanceof MediaSource && !this.liveSignal) {
      this.source.setRawVolume(target)
    }
  }

  private async fadeOut(): Promise<void> {
    if (!this.master || !this.ctx) return
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, FADE_OUT_S / 3)
    await new Promise((resolve) => window.setTimeout(resolve, FADE_OUT_S * 1000 + 30))
    this.applyVolume()
  }

  private fadeIn(): void {
    if (!this.master || !this.ctx) return
    this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.volume,
      this.ctx.currentTime,
      FADE_IN_S / 3
    )
  }

  private pullRms(): number | null {
    if (!this.analyser) return null
    const data = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (const sample of data) sum += sample * sample
    return Math.sqrt(sum / data.length)
  }

  private startRafLoop(): void {
    if (this.raf) return
    const loop = (): void => {
      this.raf = requestAnimationFrame(loop)

      if (this.isPlaying) {
        // 引擎时钟：本地文件以元素时钟为准，合成器以 AudioContext 时钟为准
        if (this.source instanceof SynthSource && this.source.step()) {
          this.emit('ended')
        }
        this.pushState()
      }

      if (this.analyser) {
        const now = performance.now()
        if (now - this.lastSpectrumPush > 50) {
          this.lastSpectrumPush = now
          const bins = new Uint8Array(this.analyser.frequencyBinCount)
          this.analyser.getByteFrequencyData(bins)
          const normalized: number[] = new Array(64)
          const step = bins.length / 64
          for (let i = 0; i < 64; i++) {
            let max = 0
            const start = Math.floor(i * step)
            const end = Math.floor((i + 1) * step)
            for (let j = start; j < end; j++) max = Math.max(max, bins[j])
            normalized[i] = max / 255
          }
          this.emit('spectrum', normalized)
          this.emit('rms', this.pullRms() ?? 0)
        }
      }
    }
    this.raf = requestAnimationFrame(loop)
  }

  /** MediaSource 静音自检降级后回调：通知 UI 切换到伪频谱。 */
  notifyDegraded(): void {
    this.liveSignal = false
    this.applyVolume()
    this.emit('degraded')
    this.pushState()
  }

  async dispose(): Promise<void> {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    if (this.rmsLogTimer) window.clearInterval(this.rmsLogTimer)
    this.rmsLogTimer = undefined
    await this.source?.dispose()
    this.source = null
    this.currentTrack = null
    await this.ctx?.close()
    this.ctx = null
    this.eqFilters = []
  }
}

/** 全局单例（引擎在同一时刻只应存在一份）。 */
export const engine = new AudioEngine()

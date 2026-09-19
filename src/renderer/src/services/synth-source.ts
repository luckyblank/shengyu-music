import type { SynthRecipe, Track } from '../types/music'

/**
 * 生成式音源：纯 Web Audio 程序化合成。
 *
 * 调度器每 120ms 向未来 600ms 的窗口内排入乐句事件（垫/拨弦/钟琴/贝斯/鼓），
 * 所有随机决策来自 (种子, 小节, 步) 的确定性哈希 —— 因此同一首曲子：
 *  - 每次播放听起来完全相同；
 *  - 从任意进度开始（拖动/恢复）都能落到与从头播放一致的乐句上。
 *
 * 信号链：voice → 声部通道 → 卷积混响 → 总线（EQ/音量/分析器在引擎侧）。
 */

const STEP = 16 // 每小节 16 分音符步
const SCHEDULE_AHEAD = 0.6
const TICK_MS = 120

/** pentatonic / dorian / lydian 相对根音的音程（半音）。 */
const MODES: Record<SynthRecipe['mode'], number[]> = {
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11]
}

interface Voice {
  gain: GainNode
  stop: (when: number) => void
}

export class SynthSource {
  private readonly ctx: AudioContext
  private readonly out: GainNode
  private readonly recipe: SynthRecipe
  private readonly seed: number
  private readonly bus: GainNode
  private readonly voices = new Set<Voice>()
  private timer: number | undefined
  private startAt = 0
  private startPosition = 0
  private playing = false
  private endedFired = false
  private convolver: ConvolverNode | null = null

  readonly duration: number

  constructor(ctx: AudioContext, destination: AudioNode, track: Track) {
    this.ctx = ctx
    this.recipe = track.synth as SynthRecipe
    this.seed = Number(track.id)
    this.duration = track.duration

    this.bus = ctx.createGain()
    this.bus.gain.value = 0.85

    // 注意顺序：buildReverb 依赖 this.out，必须先创建 out 再搭混响
    this.out = ctx.createGain()
    this.bus.connect(this.out)
    this.out.connect(destination)
    this.buildReverb(this.recipe.reverb)
  }

  /* ------------------------------ 播放控制 ------------------------------ */

  async prepare(): Promise<void> {
    this.ensureImpulse()
  }

  async play(fromSeconds: number): Promise<void> {
    await this.ensureImpulse()
    this.playing = true
    this.endedFired = false
    this.startPosition = Math.max(0, fromSeconds)
    this.startAt = this.ctx.currentTime
    // 关键：pause() 会把输出增益淡到 0，重新播放必须恢复，
    // 否则"暂停后再播放"会没有声音
    this.out.gain.setTargetAtTime(1, this.ctx.currentTime, 0.03)
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  pause(): void {
    this.playing = false
    if (this.timer !== undefined) window.clearInterval(this.timer)
    this.timer = undefined
    this.killVoices()
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02)
  }

  async resume(): Promise<void> {
    this.playing = true
    this.endedFired = false
    this.startAt = this.ctx.currentTime
    this.out.gain.setTargetAtTime(1, this.ctx.currentTime, 0.03)
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  async seek(toSeconds: number): Promise<void> {
    this.startPosition = Math.max(0, Math.min(toSeconds, this.duration))
    this.startAt = this.ctx.currentTime
    this.killVoices()
    this.endedFired = false
  }

  async dispose(): Promise<void> {
    this.playing = false
    if (this.timer !== undefined) window.clearInterval(this.timer)
    this.timer = undefined
    this.killVoices()
    this.bus.disconnect()
    this.out.disconnect()
    this.convolver?.disconnect()
  }

  get position(): number {
    return this.playing
      ? Math.min(this.startPosition + (this.ctx.currentTime - this.startAt), this.duration)
      : this.startPosition
  }

  setPosition(seconds: number): void {
    this.startPosition = seconds
  }

  step(): boolean {
    if (this.position >= this.duration - 0.15 && !this.endedFired) {
      this.endedFired = true
      return true
    }
    return false
  }

  /* ------------------------------ 乐句调度 ------------------------------ */

  private tick(): void {
    if (!this.playing) return
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD
    const secondsPerStep = 60 / this.recipe.bpm / 4
    const elapsed = this.position
    let stepIndex = Math.floor(elapsed / secondsPerStep)
    let stepTime = this.startAt + stepIndex * secondsPerStep

    while (stepTime < horizon) {
      if (stepTime >= this.startAt - 0.001) this.scheduleStep(stepIndex, stepTime)
      stepIndex += 1
      stepTime = this.startAt + stepIndex * secondsPerStep
    }
  }

  private scheduleStep(stepIndex: number, when: number): void {
    const { bpm, mode, progression, texture, drums, brightness, root } = this.recipe
    const bar = Math.floor(stepIndex / STEP)
    const stepInBar = stepIndex % STEP
    const secondsPerStep = 60 / bpm / 4
    const scale = MODES[mode]
    const chord = progression[bar % progression.length]
    const note = (index: number): number =>
      root + scale[((index % scale.length) + scale.length) % scale.length]

    const barFirst = stepInBar === 0
    const barThird = stepInBar === 8

    // 垫 / 弦乐铺底：每小节换和弦，两拍长音
    if (texture === 'pad' && (barFirst || barThird)) {
      const basis = chord[stepInBar === 0 ? 0 : 1 % chord.length]
      this.pad(note(basis), when, (60 / bpm) * 8, 0.09)
      this.pad(note(basis) + 7, when, (60 / bpm) * 8, 0.055)
      this.pad(note(basis) + 12, when, (60 / bpm) * 7, 0.05)
    }

    // 主奏声部：拨弦 / 钟琴，密度随种子变化
    const melodySeed = this.rand(bar, 'm')
    const melodyEvery =
      texture === 'pluck' ? (melodySeed > 0.75 ? 3 : 4) : melodySeed > 0.62 ? 4 : 8
    if (stepInBar % melodyEvery === 0) {
      const degree = Math.floor(this.rand(stepIndex, 'd') * 5)
      const octave = this.rand(stepIndex, 'o') > 0.72 ? 12 : 0
      const target = note(chord[degree % chord.length] + degree + octave)
      const length = (melodyEvery === 8 ? 7 : 2.6) * secondsPerStep
      if (texture === 'bell') this.bell(target, when, length, 0.1)
      else this.pluck(target, when, length, 0.12)
    }

    // 贝斯：根音，八分音符律动
    if (stepInBar % 2 === 0) {
      const octave = this.rand(stepIndex, 'b') > 0.8 ? -12 : -24
      this.bass(
        note(chord[stepInBar % 8 === 0 ? 0 : 2 % chord.length]) + octave,
        when,
        secondsPerStep * 1.8,
        0.16
      )
    }

    // 打击乐：踩镲 / 底鼓，密度由配方控制
    if (drums > 0.04) {
      if (stepInBar % 2 === 0 && this.rand(stepIndex, 'h') < drums * 1.6) {
        this.hat(when, 0.028 * (0.7 + this.rand(stepIndex, 'hv') * 0.6))
      }
      if (stepInBar === 0 || stepInBar === 10) {
        this.kick(when, 0.34)
      }
      if (stepInBar === 14 && this.rand(bar, 's') < drums) this.kick(when, 0.22)
    }

    // 点缀音：偶尔的高音铃声
    if (stepInBar === 3 && this.rand(bar, 'x') < 0.24 + brightness * 0.3) {
      this.bell(note(4) + 24, when, secondsPerStep * 5, 0.03)
    }

    if (stepInBar === 0 && this.rand(bar, 'shine') < brightness * 0.22) {
      this.shine(note(2) + 24, when, (60 / bpm) * 4, 0.016)
    }
  }

  /* ------------------------------- 确定性随机 ------------------------------ */

  private rand(seedA: number, tag: string): number {
    let h = (this.seed ^ (seedA * 0x9e3779b1)) >>> 0
    for (const char of tag) h = ((h ^ char.charCodeAt(0)) * 0x01000193) >>> 0
    h = ((h ^ (h >>> 16)) * 0x85ebca6b) >>> 0
    h = (h ^ (h >>> 13)) >>> 0
    return (h & 0xffffff) / 0x1000000
  }

  /* -------------------------------- 声部音色 -------------------------------- */

  private channel(label: string): { out: GainNode; dry: GainNode } {
    const out = this.ctx.createGain()
    const dry = this.ctx.createGain()
    out.connect(this.bus)
    dry.connect(out)
    if (this.convolver) {
      // 发送式混响：每条声部带独立发送增益，湿声统一在 buildReverb 里回 bus。
      // （若在每条声部里建湿声返回，卷积尾会随声部数量叠加而失控放大）
      const send = this.ctx.createGain()
      send.gain.value = label === 'bass' || label === 'kick' ? 0.22 : 0.75
      out.connect(send)
      send.connect(this.convolver)
    }
    return { out, dry }
  }

  private voiceFrom(gain: GainNode, _when: number, release: number): Voice {
    const stop = (at: number): void => {
      try {
        gain.gain.setTargetAtTime(0, at, Math.max(0.02, release / 5))
      } catch {
        /* 已断开 */
      }
    }
    const voice: Voice = { gain, stop }
    this.voices.add(voice)
    window.setTimeout(
      () => {
        this.voices.delete(voice)
        try {
          gain.disconnect()
        } catch {
          /* 已断开 */
        }
      },
      Math.min(release * 1600, 30000)
    )
    return voice
  }

  private pad(freq: number, when: number, length: number, level: number): void {
    const { dry } = this.channel('pad')
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(level, when + length * 0.25)
    gain.gain.setValueAtTime(level, when + length * 0.82)
    gain.gain.linearRampToValueAtTime(0.0001, when + length)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 750 + this.recipe.brightness * 950
    filter.Q.value = 0.4
    for (const detune of [-6, 6]) {
      const osc = this.ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = freq
      osc.detune.value = detune
      osc.connect(filter)
      osc.start(when)
      osc.stop(when + length + 0.15)
    }
    filter.connect(gain)
    gain.connect(dry)
    this.voiceFrom(gain, when, length)
  }

  private pluck(freq: number, when: number, length: number, level: number): void {
    const { dry } = this.channel('pluck')
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(level, when)
    gain.gain.setTargetAtTime(0.0001, when, length / 3)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(2600 + this.recipe.brightness * 2600, when)
    filter.frequency.exponentialRampToValueAtTime(480, when + length)
    const osc = this.ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(dry)
    osc.start(when)
    osc.stop(when + length + 0.12)
    this.voiceFrom(gain, when, length)
  }

  private bell(freq: number, when: number, length: number, level: number): void {
    const { dry } = this.channel('bell')
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(level, when)
    gain.gain.setTargetAtTime(0.0001, when, length / 4)
    const partials: Array<[number, number]> = [
      [1, 1],
      [2.76, 0.32],
      [5.4, 0.1]
    ]
    for (const [ratio, amp] of partials) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq * ratio
      const partialGain = this.ctx.createGain()
      partialGain.gain.value = amp
      osc.connect(partialGain)
      partialGain.connect(gain)
      osc.start(when)
      osc.stop(when + length + 0.1)
    }
    gain.connect(dry)
    this.voiceFrom(gain, when, length)
  }

  private bass(freq: number, when: number, length: number, level: number): void {
    const { dry } = this.channel('bass')
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(level, when)
    gain.gain.setTargetAtTime(0.0001, when + length * 0.5, length / 3)
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const sub = this.ctx.createOscillator()
    sub.type = 'triangle'
    sub.frequency.value = freq / 2
    const subGain = this.ctx.createGain()
    subGain.gain.value = 0.35
    osc.connect(gain)
    sub.connect(subGain)
    subGain.connect(gain)
    gain.connect(dry)
    osc.start(when)
    sub.start(when)
    osc.stop(when + length + 0.1)
    sub.stop(when + length + 0.1)
    this.voiceFrom(gain, when, length)
  }

  private kick(when: number, level: number): void {
    const { dry } = this.channel('kick')
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(level, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.32)
    const osc = this.ctx.createOscillator()
    osc.frequency.setValueAtTime(140, when)
    osc.frequency.exponentialRampToValueAtTime(38, when + 0.28)
    osc.connect(gain)
    gain.connect(dry)
    osc.start(when)
    osc.stop(when + 0.35)
    this.voiceFrom(gain, when, 0.35)
  }

  private hat(when: number, level: number): void {
    const { dry } = this.channel('hat')
    const buffer = this.noiseBuffer()
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 7800
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(level, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.09)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(dry)
    source.start(when)
    source.stop(when + 0.1)
    this.voiceFrom(gain, when, 0.1)
  }

  private shine(freq: number, when: number, length: number, level: number): void {
    const { dry } = this.channel('bell')
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.linearRampToValueAtTime(level, when + 0.4)
    gain.gain.setTargetAtTime(0.0001, when + length * 0.5, length / 3)
    for (const ratio of [1, 1.005]) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq * ratio
      osc.connect(gain)
      osc.start(when)
      osc.stop(when + length + 0.2)
    }
    gain.connect(dry)
    this.voiceFrom(gain, when, length)
  }

  private noise: AudioBuffer | undefined
  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.15, this.ctx.sampleRate)
      const data = this.noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    }
    return this.noise
  }

  private buildReverb(amount: number): void {
    if (amount <= 0) return
    const length = Math.floor(this.ctx.sampleRate * 2.4)
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel)
      // 单极低通滤波后的噪声脉冲：白噪声卷积会让混响尾音充满"嘶嘶"杂音，
      // 滤波后尾音变暗变柔，更接近真实厅堂反射
      let smoothed = 0
      const alpha = 0.08 + 0.1 * amount
      for (let i = 0; i < length; i++) {
        const noise = Math.random() * 2 - 1
        smoothed += alpha * (noise - smoothed)
        data[i] = smoothed * (1 - i / length) ** 2.6
      }
    }
    this.convolver = this.ctx.createConvolver()
    this.convolver.buffer = impulse
    // 关闭默认归一化：归一化会把衰减型脉冲放大数十 dB，导致湿声爆音
    this.convolver.normalize = false
    // 唯一的湿声返回路径：卷积尾只回一次 bus
    const wet = this.ctx.createGain()
    wet.gain.value = 0.24 + 0.1 * amount
    this.convolver.connect(wet)
    wet.connect(this.bus)
  }

  private async ensureImpulse(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  private killVoices(): void {
    const now = this.ctx.currentTime
    for (const voice of this.voices) voice.stop(now)
    this.voices.clear()
  }
}

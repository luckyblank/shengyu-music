import type { Track } from '../types/music'

/**
 * 本地文件音源：HTMLAudioElement 走 shengyu-media:// 协议（主进程支持 Range）。
 *
 * 静音自检：如果 MediaElementSource 因跨源污染被静音（防御性兜底），
 * 播放 4 秒内检测不到任何音频信号，就自动重建元素、放弃 Web Audio 通路，
 * 保证"永远有声音"（代价只是该文件没有真实频谱，UI 会切到伪频谱动画）。
 */

const PROBE_WINDOW_S = 4

export interface MediaSourceProbe {
  analyser: AnalyserNode
  /** 每 ~200ms 读取一次；返回 null 表示未连接到分析器。 */
  pullRms: () => number | null
}

export class MediaSource {
  private audio: HTMLAudioElement | null = null
  private probe: MediaSourceProbe | null = null
  private pendingLoad: Promise<void> | null = null
  private failed = false

  constructor(
    private readonly track: Track,
    private readonly hooks: {
      onEnded?: () => void
      onDegraded?: () => void
    } = {}
  ) {}

  /** 真实时长：优先取已加载元素，回落到曲目元数据。 */
  get duration(): number {
    const elementDuration = this.audio?.duration ?? 0
    if (Number.isFinite(elementDuration) && elementDuration > 0) return elementDuration
    return this.track.duration
  }

  get isFailed(): boolean {
    return this.failed
  }

  get position(): number {
    return this.audio?.currentTime ?? 0
  }

  async prepare(connect: (element: HTMLAudioElement) => MediaSourceProbe | null): Promise<void> {
    this.audio = this.buildElement()
    if (!this.track.url) throw new Error('本地曲目缺少音源地址')
    this.audio.src = this.track.url
    this.probe = connect(this.audio)
    this.audio.addEventListener('ended', this.handleEnded)
    await this.whenUsable()
  }

  async play(fromSeconds: number): Promise<void> {
    if (!this.audio) throw new Error('音源未初始化')
    if (Number.isFinite(fromSeconds) && Math.abs(this.audio.currentTime - fromSeconds) > 0.3) {
      this.audio.currentTime = Math.min(fromSeconds, this.audio.duration || fromSeconds)
    }
    await this.audio.play()
  }

  pause(): void {
    this.audio?.pause()
  }

  async resume(): Promise<void> {
    if (!this.audio) return
    await this.audio.play()
  }

  async seek(toSeconds: number): Promise<void> {
    if (this.audio) this.audio.currentTime = Math.max(0, toSeconds)
  }

  async dispose(): Promise<void> {
    const element = this.audio
    this.audio = null
    this.probe = null
    if (element) {
      try {
        element.pause()
      } catch {
        /* ignore */
      }
      element.removeAttribute('src')
      element.load()
    }
  }

  /** 探针：正常路径返回分析器读数，降级后返回 null（UI 用伪频谱）。 */
  pullRms(): number | null {
    if (!this.probe || this.probe.analyser.context.state !== 'running') return null
    return this.probe.pullRms()
  }

  /** 直连模式（未接入 Web Audio 图）时的音量，由引擎在音量/静音变化时调用。 */
  setRawVolume(value: number): void {
    if (this.audio) this.audio.volume = value
  }

  /**
   * 静音自检：开始播放后，position 前进但分析器一直无声 → 判定跨源静音 → 自动降级。
   */
  onPlaybackStarted(): void {
    if (!this.audio || !this.probe) return
    const element = this.audio
    const startPosition = element.currentTime
    let elapsed = 0
    const timer = window.setInterval(() => {
      elapsed += 0.25
      if (element !== this.audio || element.paused || element.ended) {
        window.clearInterval(timer)
        return
      }
      const advanced = element.currentTime - startPosition > 2
      if (elapsed >= PROBE_WINDOW_S) {
        window.clearInterval(timer)
        return
      }
      if (!advanced) return
      const rms = this.probe?.pullRms() ?? 0
      if (rms !== null && rms < 0.0008) {
        this.degradeToDirect()
        window.clearInterval(timer)
      }
    }, 250)
  }

  private degradeToDirect(): void {
    console.warn('[engine] 检测到跨源静音，降级为直连播放')
    const element = this.audio
    const wasPlaying = Boolean(element && !element.paused)
    const position = element?.currentTime ?? 0
    const src = this.track.url as string
    this.probe = null
    if (element) {
      element.pause()
      element.removeAttribute('src')
      element.load()
    }
    const fresh = this.buildElement()
    fresh.src = src
    fresh.currentTime = position
    fresh.addEventListener('ended', this.handleEnded)
    if (wasPlaying) void fresh.play().catch(() => undefined)
    this.audio = fresh
    this.hooks.onDegraded?.()
  }

  private handleEnded = (): void => {
    this.hooks.onEnded?.()
  }

  private buildElement(): HTMLAudioElement {
    const element = new Audio()
    element.preload = 'auto'
    // 跨源策略：自有协议与声明支持 CORS 的在线域名走匿名模式（可进 Web Audio 图）；
    // 其余域名不设 crossOrigin —— 设置了反而会因为缺少 ACAO 头而整首加载失败
    const url = this.track.url ?? ''
    const corsSafe = url.startsWith('shengyu-media:') || this.track.cors === true
    if (corsSafe) element.crossOrigin = 'anonymous'
    element.volume = 1
    return element
  }

  private whenUsable(): Promise<void> {
    if (this.pendingLoad) return this.pendingLoad
    const element = this.audio
    if (!element) return Promise.reject(new Error('音源未初始化'))
    this.pendingLoad = new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        element.removeEventListener('canplay', onReady)
        element.removeEventListener('loadedmetadata', onReady)
        element.removeEventListener('error', onError)
        fn()
      }
      const onReady = (): void => finish(() => resolve())
      const onError = (): void => {
        this.failed = true
        const code = element.error?.code
        finish(() =>
          reject(
            new Error(
              `音频加载失败：${this.track.title}（code=${code ?? '?'} ${element.error?.message ?? ''}）`
            )
          )
        )
      }
      element.addEventListener('canplay', onReady)
      element.addEventListener('loadedmetadata', onReady)
      element.addEventListener('error', onError)
      // 文件被移走时 error 未必触发，兜底超时；在线音源/电台给足冷启动/慢网余量
      const timeoutMs =
        this.track.origin === 'remote' || this.track.origin === 'radio' ? 25000 : 8000
      window.setTimeout(() => {
        this.failed = true
        finish(() => reject(new Error(`音频加载超时：${this.track.title}`)))
      }, timeoutMs)
    }).finally(() => {
      this.pendingLoad = null
    })
    return this.pendingLoad
  }
}

import { computed, ref, watch } from 'vue'
import type { RepeatMode, RemoteCommand } from '@shared/ipc'
import { engine } from '../services/audio-engine'
import { trackById, recordPlay } from './library'
import type { QueueLabel, Track } from '../types/music'

/**
 * 播放器 store：队列、播放模式与引擎的桥接层。
 * 引擎只懂"当前曲目 + 时钟"，队列策略（随机/循环/下一首播放）都在这里。
 */

export const queue = ref<string[]>([])
export const queueIndex = ref(-1)
export const queueLabel = ref<QueueLabel>('demo')
export const shuffled = ref(false)
export const repeatMode = ref<RepeatMode>('off')

export const isPlaying = ref(false)
export const position = ref(0)
export const duration = ref(0)
export const volume = ref(0.68)
export const muted = ref(false)
export const loading = ref(false)
export const failed = ref(false)
export const liveSignal = ref(true)

export const currentId = ref<string | null>(null)
export const currentTrack = computed<Track | null>(() => trackById(currentId.value) ?? null)

const persistedPosition = ref(0)
const persistedQueue = ref<string[]>([])

let hydrated = false

/* ------------------------------ 引擎事件桥接 ------------------------------ */

engine.on('state', (snapshot) => {
  if (!hydrated) return
  // 引擎时钟 → 响应式状态（位置每帧刷新，其余仅在变化时写入）
  position.value = snapshot.position
  duration.value = snapshot.duration || currentTrack.value?.duration || 0
  if (isPlaying.value !== snapshot.isPlaying) isPlaying.value = snapshot.isPlaying
  if (loading.value !== snapshot.loading) loading.value = snapshot.loading
  if (failed.value !== snapshot.failed) failed.value = snapshot.failed
  if (liveSignal.value !== snapshot.liveSignal) liveSignal.value = snapshot.liveSignal
})

engine.on('ended', () => {
  console.log('[player] 曲目结束 →', repeatMode.value === 'one' ? '单曲循环' : '下一首')
  if (repeatMode.value === 'one') {
    void playAt(queueIndex.value)
  } else {
    void next(true)
  }
})

engine.on('error', (message) => {
  failed.value = true
  window.ui?.toast?.(message, 'error')
})

/* ------------------------------ 启动与持久化 ------------------------------ */

export async function hydratePlayer(state: {
  trackId: string | null
  position: number
  volume: number
  muted: boolean
  shuffled: boolean
  repeat: RepeatMode
  queue: string[]
  queueLabel: string
  restoreOnLaunch: boolean
}): Promise<void> {
  volume.value = state.volume
  muted.value = state.muted
  shuffled.value = state.shuffled
  repeatMode.value = state.repeat
  engine.setVolume(state.volume)
  engine.setMuted(state.muted)

  persistedPosition.value = state.position
  persistedQueue.value = state.queue

  const restoredTrack = state.trackId ? trackById(state.trackId) : undefined
  if (restoredTrack) {
    // 旧档里可能存着重复 id（曲库合并曾未去重），恢复时顺手拍平，否则同一首会播两遍
    const restoredQueue = [...new Set(state.queue)]
    queue.value = restoredQueue.filter((id) => trackById(id)).length
      ? restoredQueue
      : [restoredTrack.id]
    queueIndex.value = queue.value.indexOf(restoredTrack.id)
    if (queueIndex.value < 0) {
      queue.value = [restoredTrack.id]
      queueIndex.value = 0
    }
    queueLabel.value = (state.queueLabel || 'single') as QueueLabel
    currentId.value = restoredTrack.id
    if (state.restoreOnLaunch) {
      await engine.load(restoredTrack, state.position)
    } else {
      // 只恢复"停在哪儿"，不自动出声
      currentId.value = restoredTrack.id
      await engine.load(restoredTrack, state.position)
      await engine.pause()
    }
  }
  hydrated = true
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persist(): void {
  if (!hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    window.shengyu.saveState({
      playback: {
        trackId: currentId.value,
        position: position.value,
        volume: volume.value,
        muted: muted.value,
        shuffled: shuffled.value,
        repeat: repeatMode.value,
        // 注意：Vue 响应式代理无法跨 contextBridge 结构化克隆，必须展开为普通数组
        queue: [...queue.value],
        queueLabel: queueLabel.value
      }
    })
  }, 600)
}

watch([volume, muted, shuffled, repeatMode, queue, queueLabel, currentId], persist, {
  deep: false
})

/* ------------------------------ 核心控制 ------------------------------ */

export async function playTrack(track: Track | undefined): Promise<void> {
  if (!track) return
  if (track.id === currentId.value) {
    await toggle()
    return
  }
  // 单曲播放也保证队列可续播（播完按模式循环/切歌，而不是哑停）
  const index = queue.value.indexOf(track.id)
  if (index < 0) {
    queue.value = [...queue.value, track.id]
    queueIndex.value = queue.value.length - 1
  } else {
    queueIndex.value = index
  }
  await loadTrack(track)
}

export async function playTracks(
  tracks: Track[],
  label: QueueLabel,
  startIndex = 0
): Promise<void> {
  if (!tracks.length) return
  // 入队前按 id 去重：调用方给来的列表可能自带同一首的两份（曲库里同时有已导入的那份
  // 与榜单临时曲那份），不去重就会把同一首排进队列两次，切歌时听起来就是「又放了一遍」
  const startTrack = tracks[Math.min(Math.max(0, startIndex), tracks.length - 1)]
  const seen = new Set<string>()
  const unique = tracks.filter((track) => {
    if (seen.has(track.id)) return false
    seen.add(track.id)
    return true
  })
  queue.value = unique.map((track) => track.id)
  // 去重会挪动下标，起始曲必须按 id 重新定位，否则播放全部会从错误的一首开始
  const at = queue.value.indexOf(startTrack.id)
  queueIndex.value = at >= 0 ? at : 0
  queueLabel.value = label
  await loadTrack(unique[queueIndex.value])
}

/** 向主进程汇报完整播放状态（托盘/任务栏/迷你窗共用）。 */
function reportNowPlaying(playing: boolean): void {
  const track = currentTrack.value
  if (!track) return
  window.shengyu.reportPlayerState({
    title: track.title,
    artist: track.artist,
    album: track.album,
    cover: track.cover.kind === 'variant' ? track.cover.variant : track.cover.url ?? null,
    origin: track.origin,
    isPlaying: playing,
    position: position.value,
    duration: track.duration
  })
}

export async function loadTrack(track: Track): Promise<void> {
  failed.value = false
  currentId.value = track.id
  await engine.load(track)
  recordPlay(track.id)
  await engine.play()
  persist()
  reportNowPlaying(true)
}

export async function playAt(index: number): Promise<void> {
  const track = trackById(queue.value[index])
  if (!track) return
  queueIndex.value = index
  await loadTrack(track)
}

/** 下一首播放：插到当前曲目之后（不打断正在播的）。 */
export function playNext(track: Track): void {
  if (!queue.value.length) {
    queue.value = [track.id]
    queueIndex.value = 0
    return
  }
  const target = queueIndex.value + 1
  if (queue.value[target] === track.id) return
  // 正在播的这首不插队：队列里出现两遍同一首，就是「切歌切到同一首歌」
  if (track.id === queue.value[queueIndex.value]) return
  const current = queue.value[queueIndex.value]
  // 头尾都要剔除同一首：只清尾部的话，排在当前位置之前的旧副本会留下来成为第二份
  queue.value = [
    ...queue.value.slice(0, target).filter((id) => id !== track.id),
    track.id,
    ...queue.value.slice(target).filter((id) => id !== track.id)
  ]
  // 剔除旧副本可能挪动当前曲目的下标，按 id 重新定位而不是沿用旧值
  const at = queue.value.indexOf(current)
  if (at >= 0) queueIndex.value = at
  window.ui?.toast?.(`下一首播放：${track.title}`, 'info')
}

/** 追加到队尾。 */
export function enqueue(track: Track): void {
  if (!queue.value.length) {
    queue.value = [track.id]
    queueIndex.value = 0
  } else if (!queue.value.includes(track.id)) {
    queue.value.push(track.id)
  } else {
    window.ui?.toast?.('这首歌已经在队列里了', 'info')
    return
  }
  window.ui?.toast?.(`已加入队列：${track.title}`, 'info')
}

export function removeFromQueue(index: number): void {
  if (index === queueIndex.value) {
    void next(true)
    return
  }
  queue.value = queue.value.filter((_, i) => i !== index)
  if (index < queueIndex.value) queueIndex.value -= 1
}

export function reorderQueue(from: number, to: number): void {
  if (from === to || from < 0 || to < 0) return
  const list = [...queue.value]
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  const current = queue.value[queueIndex.value]
  queue.value = list
  queueIndex.value = list.indexOf(current)
}

export function clearQueue(): void {
  queue.value = []
  queueIndex.value = -1
  window.ui?.toast?.('队列已清空', 'info')
}

export async function toggle(): Promise<void> {
  if (loading.value) return
  if (!currentTrack.value) {
    const first = queue.value.length ? trackById(queue.value[0]) : undefined
    if (first) await loadTrack(first)
    return
  }
  if (isPlaying.value) {
    await engine.pause()
    reportNowPlaying(false)
  } else {
    if (failed.value) {
      // 文件失效后重试：重新加载一次
      await engine.load(currentTrack.value, position.value)
    }
    await engine.play()
    reportNowPlaying(true)
  }
}

export async function next(auto = false): Promise<void> {
  if (!queue.value.length) return
  if (repeatMode.value === 'one') {
    await playAt(queueIndex.value)
    return
  }
  if (shuffled.value) {
    if (queue.value.length > 1) {
      let candidate = queueIndex.value
      while (candidate === queueIndex.value) {
        candidate = Math.floor(Math.random() * queue.value.length)
      }
      await playAt(candidate)
    } else {
      await playAt(0)
    }
    return
  }
  const atEnd = queueIndex.value >= queue.value.length - 1
  if (atEnd) {
    if (repeatMode.value === 'all') await playAt(0)
    else if (auto) {
      // 自然播完最后曲目：停止但不报错
      isPlaying.value = false
      reportNowPlaying(false)
    }
    return
  }
  await playAt(queueIndex.value + 1)
}

export async function previous(): Promise<void> {
  if (position.value > 3) {
    await seek(0)
    return
  }
  if (shuffled.value && queue.value.length > 1) {
    let candidate = queueIndex.value
    while (candidate === queueIndex.value) {
      candidate = Math.floor(Math.random() * queue.value.length)
    }
    await playAt(candidate)
    return
  }
  if (queueIndex.value > 0) await playAt(queueIndex.value - 1)
  else if (repeatMode.value === 'all') await playAt(queue.value.length - 1)
  else await seek(0)
}

export async function seek(toSeconds: number): Promise<void> {
  position.value = toSeconds
  await engine.seek(toSeconds)
}

export function setVolume(value: number): void {
  volume.value = Math.max(0, Math.min(1, value))
  engine.setVolume(volume.value)
}

export function toggleMuted(): void {
  muted.value = !muted.value
  engine.setMuted(muted.value)
}

export function cycleRepeat(): void {
  repeatMode.value = repeatMode.value === 'off' ? 'all' : repeatMode.value === 'all' ? 'one' : 'off'
}

export function toggleShuffle(): void {
  shuffled.value = !shuffled.value
}

export const queueTracks = computed(() =>
  queue.value.map((id) => trackById(id)).filter((track): track is Track => Boolean(track))
)

export const upNextTracks = computed(() => {
  if (queueIndex.value < 0) return queueTracks.value
  return [
    ...queueTracks.value.slice(queueIndex.value + 1),
    ...queueTracks.value.slice(0, queueIndex.value)
  ]
})

/* ------------------------------ 远程指令（托盘/媒体键） ------------------------------ */

let remoteUnsubscribe: (() => void) | undefined
let progressTimer: number | undefined

/** 播放中每秒上报一次进度（任务栏进度条 + 迷你窗同步）。 */
function startProgressReporting(): void {
  if (progressTimer) window.clearInterval(progressTimer)
  progressTimer = window.setInterval(() => {
    if (isPlaying.value) {
      window.shengyu.reportProgress(
        position.value,
        duration.value || currentTrack.value?.duration || 0
      )
    }
  }, 1000)
}

export function bindRemoteCommands(): void {
  startProgressReporting()
  remoteUnsubscribe = window.shengyu.onRemoteCommand((command: RemoteCommand) => {
    switch (command) {
      case 'play-pause':
        void toggle()
        break
      case 'play':
        if (!isPlaying.value) void toggle()
        break
      case 'pause':
        if (isPlaying.value) void toggle()
        break
      case 'next':
        void next()
        break
      case 'previous':
        void previous()
        break
      case 'stop':
        if (isPlaying.value) void toggle()
        break
      case 'like':
        if (currentId.value) window.player?.toggleLike?.()
        break
      case 'volume-up':
        setVolume(Math.min(1, volume.value + 0.05))
        break
      case 'volume-down':
        setVolume(Math.max(0, volume.value - 0.05))
        break
    }
  })
}

export function unbindRemoteCommands(): void {
  remoteUnsubscribe?.()
  remoteUnsubscribe = undefined
}

/* --------------------- 系统媒体会话（Windows SMTC 浮窗） --------------------- */

function syncMediaSession(): void {
  if (!('mediaSession' in navigator)) return
  const track = currentTrack.value
  if (!track) {
    navigator.mediaSession.metadata = null
    return
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.origin === 'radio' ? track.album : track.artist,
    album: track.origin === 'radio' ? '网络电台' : track.album
  })
  navigator.mediaSession.playbackState = isPlaying.value ? 'playing' : 'paused'
  navigator.mediaSession.setActionHandler('play', () => void toggle())
  navigator.mediaSession.setActionHandler('pause', () => void toggle())
  navigator.mediaSession.setActionHandler('nexttrack', () => void next())
  navigator.mediaSession.setActionHandler('previoustrack', () => void previous())
}

watch([currentId, isPlaying], syncMediaSession, { immediate: true })

/** 恢复上次播放状态（位置在 hydrate 时由引擎恢复）。 */
export function lastPersisted(): { position: number; queue: string[] } {
  return { position: persistedPosition.value, queue: persistedQueue.value }
}

export function disposePlayer(): void {
  unbindRemoteCommands()
  if (progressTimer) window.clearInterval(progressTimer)
  void engine.dispose()
}

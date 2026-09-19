import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { AppState } from '../shared/ipc'

/**
 * 应用状态持久化：userData/state.json
 *
 * - 原子写（先写 .tmp 再 rename），避免进程被杀时留下半个 JSON；
 * - 500ms 防抖，音量拖动这类高频操作不会打爆磁盘；
 * - 读取失败一律回落默认值，坏档不能让应用起不来。
 */

const STATE_VERSION = 1
let cache: AppState | null = null
let flushTimer: NodeJS.Timeout | undefined
let writing: Promise<void> = Promise.resolve()

export function statePath(): string {
  return join(app.getPath('userData'), 'state.json')
}

export function defaultState(): AppState {
  return {
    version: STATE_VERSION,
    playback: {
      trackId: null,
      position: 0,
      volume: 0.68,
      muted: false,
      shuffled: false,
      repeat: 'off',
      queue: [],
      queueLabel: ''
    },
    imported: [],
    onlineTracks: [],
    liked: [],
    recent: [],
    playlists: [],
    lyricsTexts: {},
    chartSnapshots: {},
    playStats: { hours: new Array(24).fill(0), genres: {}, artists: {} },
    equalizer: { enabled: false, preset: 'flat', gains: [0, 0, 0, 0, 0] },
    settings: {
      crossfade: true,
      restoreOnLaunch: true,
      trayEnabled: true,
      // 默认亮色：与网易云客户端的浅底观感一致
      theme: 'light',
      fx: 'none',
      lyricsColor: '#ffffff',
      searchHistory: [],
      followedHosts: []
    }
  }
}

export async function loadState(): Promise<AppState> {
  if (cache) return cache
  try {
    const raw = await readFile(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppState>
    cache = migrate(parsed)
  } catch {
    cache = defaultState()
  }
  return cache
}

export function saveState(patch: Partial<AppState>): void {
  const base = cache ?? defaultState()
  cache = {
    ...base,
    ...patch,
    version: STATE_VERSION,
    playback: { ...base.playback, ...(patch.playback ?? {}) },
    equalizer: { ...base.equalizer, ...(patch.equalizer ?? {}) },
    settings: { ...base.settings, ...(patch.settings ?? {}) }
  }
  scheduleFlush()
}

export async function flushState(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = undefined
  }
  await write()
  await writing
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void write()
  }, 500)
}

function write(): Promise<void> {
  if (!cache) return Promise.resolve()
  const snapshot = JSON.stringify(cache, null, 2)
  const target = statePath()
  writing = writing
    .then(async () => {
      await mkdir(dirname(target), { recursive: true })
      const tmp = `${target}.tmp`
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, target)
    })
    .catch((error) => {
      console.error('[state] 写入失败', error)
    })
  return writing
}

function migrate(parsed: Partial<AppState>): AppState {
  const base = defaultState()
  return {
    version: STATE_VERSION,
    playback: { ...base.playback, ...(parsed.playback ?? {}) },
    imported: Array.isArray(parsed.imported) ? parsed.imported : [],
    onlineTracks: Array.isArray(parsed.onlineTracks) ? parsed.onlineTracks : [],
    liked: Array.isArray(parsed.liked) ? parsed.liked : [],
    recent: Array.isArray(parsed.recent) ? parsed.recent : [],
    playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
    lyricsTexts:
      parsed.lyricsTexts && typeof parsed.lyricsTexts === 'object' ? parsed.lyricsTexts : {},
    chartSnapshots:
      parsed.chartSnapshots && typeof parsed.chartSnapshots === 'object'
        ? parsed.chartSnapshots
        : {},
    playStats: {
      ...base.playStats,
      ...(parsed.playStats ?? {}),
      // 时段桶必须是 24 个，旧档或手改过的档都要补齐
      hours:
        Array.isArray(parsed.playStats?.hours) && parsed.playStats.hours.length === 24
          ? parsed.playStats.hours
          : base.playStats.hours
    },
    equalizer: { ...base.equalizer, ...(parsed.equalizer ?? {}) },
    settings: { ...base.settings, ...(parsed.settings ?? {}) }
  }
}

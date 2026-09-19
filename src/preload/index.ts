import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc'
import type {
  AppState,
  AppVersions,
  ChartResult,
  ImportResult,
  LocalTrackMeta,
  LyricsPickResult,
  PlayerSyncPayload,
  RadioChannelsResult,
  RemoteCommand
} from '../shared/ipc'

/**
 * 渲染层唯一的能力入口：window.shengyu。
 * 不暴露任何 Node/Electron 原始对象，通道名集中在 shared/ipc.ts 维护。
 */

function on<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

/** 调试用：把无法结构化克隆的 patch 打印成可读结构。 */
function safeInspect(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => safeInspect(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    try {
      out[key] = typeof item === 'function' ? '[function]' : safeInspect(item, depth + 1)
    } catch (error) {
      out[key] = `[inspect-failed: ${(error as Error).message}]`
    }
  }
  return out
}

const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
  } catch (error) {
    console.error(`[preload] invoke ${channel} 失败`, error, safeInspect(args))
    throw error
  }
}

const send = (channel: string, payload: unknown): void => {
  try {
    ipcRenderer.send(channel, payload)
  } catch (error) {
    console.error(`[preload] send ${channel} 失败`, error, safeInspect(payload))
  }
}

const api = {
  // 状态持久化
  loadState: (): Promise<AppState> => invoke(IPC.stateLoad),
  saveState: (patch: Partial<AppState>): void => send(IPC.stateSave, patch),
  statePath: (): Promise<string> => invoke(IPC.statePath),

  // 本地曲库
  pickFiles: (): Promise<ImportResult> => invoke(IPC.libraryPickFiles),
  pickFolder: (): Promise<ImportResult> => invoke(IPC.libraryPickFolder),
  resolvePaths: (paths: string[]): Promise<ImportResult> => invoke(IPC.libraryResolvePaths, paths),
  checkPaths: (paths: string[]): Promise<Record<string, boolean>> =>
    invoke(IPC.libraryCheck, paths),
  readLyrics: (path: string): Promise<string | null> => invoke(IPC.libraryReadLyrics, path),
  pickLyrics: (): Promise<LyricsPickResult> => invoke(IPC.libraryPickLyrics),
  revealInFolder: (path: string): Promise<void> => invoke(IPC.libraryReveal, path),

  // 在线榜单
  fetchChart: (genre: string, period: string): Promise<ChartResult> =>
    invoke(IPC.chartsFetch, genre, period),

  // 电台目录
  fetchRadioChannels: (force = false): Promise<RadioChannelsResult> =>
    invoke(IPC.radioChannels, force),

  // 无边框窗口
  minimize: (): Promise<void> => invoke(IPC.windowMinimize),
  toggleMaximize: (): Promise<boolean> => invoke(IPC.windowToggleMaximize),
  close: (): Promise<void> => invoke(IPC.windowClose),
  isMaximized: (): Promise<boolean> => invoke(IPC.windowIsMaximized),
  onMaximizedChanged: (listener: (maximized: boolean) => void): (() => void) =>
    on(IPC.windowMaximizedChanged, listener),
  setThemeBackground: (color: string): void => {
    send(IPC.windowThemeBackground, color)
  },

  // 播放器与托盘/媒体键
  reportPlayerState: (payload: PlayerSyncPayload): void => {
    send(IPC.playerReportState, payload)
  },
  reportProgress: (position: number, duration: number): void => {
    send(IPC.playerProgress, { position, duration })
  },
  sendPlayerCommand: (command: RemoteCommand): void => {
    send(IPC.playerCommand, command)
  },
  onPlayerSync: (listener: (payload: PlayerSyncPayload) => void): (() => void) =>
    on(IPC.playerSync, listener),
  onRemoteCommand: (
    listener: (command: import('../shared/ipc').RemoteCommand) => void
  ): (() => void) => on(IPC.playerRemoteCommand, listener),

  // 迷你模式
  enterMini: (): Promise<void> => invoke(IPC.windowEnterMini),
  exitMini: (): Promise<void> => invoke(IPC.windowExitMini),

  // 桌面歌词
  enterDesktopLyrics: (): Promise<void> => invoke(IPC.windowEnterDesktopLyrics),
  exitDesktopLyrics: (): Promise<void> => invoke(IPC.windowExitDesktopLyrics),
  reportLyricLine: (current: string, next: string, words: string[] = [], wordIndex = -1): void => {
    send(IPC.lyricsLine, { current, next, words, wordIndex })
  },
  onLyricLine: (
    listener: (line: { current: string; next: string; words: string[]; wordIndex: number }) => void
  ): (() => void) => on(IPC.lyricsLine, listener),
  reportLyricsColor: (color: string): void => {
    send(IPC.lyricsColor, color)
  },
  getLyricsColor: (): Promise<string> => invoke(IPC.lyricsGetColor),
  onLyricsColor: (listener: (color: string) => void): (() => void) => on(IPC.lyricsColor, listener),

  // 环境信息
  versions: (): Promise<AppVersions> => invoke(IPC.appVersions),

  /** 拖放：把渲染进程的 File 对象还原为磁盘路径。 */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  /** 判断是否处于导入白名单内（渲染层只做提示，真正拦截在协议层）。 */
  isImportedTrack: (track: LocalTrackMeta): boolean => track.id.startsWith('local-')
}

export type ShengyuApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('shengyu', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.shengyu = api
}

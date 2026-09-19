import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  Tray,
  Menu,
  nativeImage
} from 'electron'
import { dirname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import thumbPrev from '../../resources/thumbar/prev.png?asset'
import thumbNext from '../../resources/thumbar/next.png?asset'
import thumbPlay from '../../resources/thumbar/play.png?asset'
import thumbPause from '../../resources/thumbar/pause.png?asset'
import { IPC, type AppState, type PlayerSyncPayload, type RemoteCommand } from '../shared/ipc'
import { allowRoot, handleMediaProtocol, registerMediaScheme } from './media-protocol'
import {
  checkPaths,
  importPaths,
  pickFiles,
  pickFolder,
  pickLyricsFile,
  readLyrics,
  revealInFolder
} from './library'
import { flushState, loadState, saveState, statePath } from './state-store'
import { fetchChart } from './audius'
import { fetchRadioChannels } from './radio'

/** 自定义协议必须在 app ready 之前声明特权。 */
registerMediaScheme()

// 允许在没有用户手势时启动音频（用于恢复上次播放、托盘与媒体键控制）。
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let lyricsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let nowPlaying = { title: '声屿音乐', artist: '', isPlaying: false }
let lastSync: PlayerSyncPayload | null = null
let lastLyricLine: { current: string; next: string; words: string[]; wordIndex: number } = {
  current: '',
  next: '',
  words: [],
  wordIndex: -1
}
let lastLyricsColor = '#ffffff'

/** 目标尺寸对齐网易云音乐 PC 客户端。 */
const TARGET_WIDTH = 1320
const TARGET_HEIGHT = 940
const MIN_WIDTH = 1120
const MIN_HEIGHT = 760

/**
 * 窗口尺寸自适应屏幕工作区。
 *
 * 直接写死 1320×940 在缩放 125%/150% 的 1080p 屏上会被系统裁短
 * （工作区只有 1536×832 或 1280×680 DIP），看起来就是「窗口比预期小」。
 * 这里在目标值与工作区之间取小，并留一点边距避免窗口贴满屏幕像被最大化。
 * 最小尺寸同样不能超过实际窗口，否则窗口必然被裁。
 *
 * 注意：screen 模块只能在 app ready 之后使用，本函数由 whenReady 里的 createWindow 调用。
 */
function resolveWindowSize(): {
  width: number
  height: number
  minWidth: number
  minHeight: number
} {
  const { workAreaSize } = screen.getPrimaryDisplay()
  const width = Math.min(TARGET_WIDTH, Math.round(workAreaSize.width * 0.94))
  const height = Math.min(TARGET_HEIGHT, Math.round(workAreaSize.height * 0.94))
  // 打点：窗口被屏幕压缩时，只有这里能看出是工作区不够而不是代码写错
  console.log(
    `[window] 目标 ${TARGET_WIDTH}×${TARGET_HEIGHT} → 实际 ${width}×${height}` +
      `（工作区 ${workAreaSize.width}×${workAreaSize.height} DIP）`
  )
  return {
    width,
    height,
    minWidth: Math.min(MIN_WIDTH, width),
    minHeight: Math.min(MIN_HEIGHT, height)
  }
}

function createWindow(): void {
  const size = resolveWindowSize()
  mainWindow = new BrowserWindow({
    ...size,
    backgroundColor: '#101215',
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 20 },
    autoHideMenuBar: true,
    // 全平台生效：开发态 Windows 任务栏/窗口也能显示新图标（打包后 exe 自带图标）
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('maximize', () => sendMaximized(true))
  mainWindow.on('unmaximize', () => sendMaximized(false))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发态把渲染进程日志转发到终端：音频链路（RMS/解码错误）只能在渲染层观测。
  if (is.dev) {
    mainWindow.webContents.on('console-message', (event) => {
      const params = event as unknown as { message?: string; level?: string }
      console.log(`[renderer] ${params.message ?? event}`)
    })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendMaximized(value: boolean): void {
  mainWindow?.webContents.send(IPC.windowMaximizedChanged, value)
}

function sendCommand(command: RemoteCommand): void {
  broadcast(IPC.playerRemoteCommand, command)
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}

function broadcastSync(payload: PlayerSyncPayload): void {
  lastSync = payload
  broadcast(IPC.playerSync, payload)
}

/** 进入迷你模式：隐藏主窗口，创建迷你播放器。 */
function enterMiniMode(): void {
  if (!mainWindow || miniWindow) return
  const win = new BrowserWindow({
    width: 380,
    height: 190,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#101215',
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false
    }
  })
  miniWindow = win
  if (is.dev) {
    win.webContents.on('console-message', (event) => {
      const params = event as unknown as { message?: string; level?: string }
      console.log(`[mini-renderer] ${params.message ?? event}`)
    })
  }
  win.on('ready-to-show', () => {
    mainWindow?.hide()
    win.show()
    if (lastSync) win.webContents.send(IPC.playerSync, lastSync)
  })
  win.on('closed', () => {
    miniWindow = null
    mainWindow?.show()
    mainWindow?.focus()
  })

  const url =
    is.dev && process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}?mini=1`
      : `${join(__dirname, '../renderer/index.html')}?mini=1`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(url)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query: { mini: '1' } })
  }
}

function exitMiniMode(): void {
  miniWindow?.close()
}

/** 桌面歌词悬浮窗：透明、置顶、无任务栏，跟随当前歌词行。 */
function enterDesktopLyrics(): void {
  if (!lyricsWindow) {
    const win = new BrowserWindow({
      width: 780,
      height: 170,
      resizable: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        backgroundThrottling: false
      }
    })
    lyricsWindow = win
    // 明确不穿透：整窗可拖动、可接收点击（透明区域也不会把鼠标事件漏给桌面）
    win.setIgnoreMouseEvents(false)
    win.on('ready-to-show', () => {
      win.show()
      win.webContents.send(IPC.lyricsLine, lastLyricLine)
      win.webContents.send(IPC.lyricsColor, lastLyricsColor)
    })
    win.on('closed', () => {
      lyricsWindow = null
    })
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?desktop-lyrics=1`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { query: { 'desktop-lyrics': '1' } })
    }
  } else {
    lyricsWindow.show()
  }
}

function exitDesktopLyrics(): void {
  lyricsWindow?.close()
}

function buildTray(): void {
  if (tray) return
  const image = nativeImage.createFromPath(icon).resize({ width: 18, height: 18 })
  // 不设 template：自定义彩色图标应原样显示（template 模式会把它变成单色剪影）
  tray = new Tray(image)
  tray.setToolTip('声屿音乐')
  refreshTray()
  tray.on('click', () => {
    if (!mainWindow) return createWindow()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

function refreshTray(): void {
  if (!tray) return
  const label = nowPlaying.artist ? `${nowPlaying.title} — ${nowPlaying.artist}` : nowPlaying.title
  tray.setToolTip(`声屿音乐 · ${label}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: label.slice(0, 64), enabled: false },
      { type: 'separator' },
      { label: nowPlaying.isPlaying ? '暂停' : '播放', click: () => sendCommand('play-pause') },
      { label: '上一首', click: () => sendCommand('previous') },
      { label: '下一首', click: () => sendCommand('next') },
      { type: 'separator' },
      {
        label: '显示主窗口',
        click: () => {
          if (!mainWindow) return createWindow()
          mainWindow.show()
          mainWindow.focus()
        }
      },
      { label: '退出', click: () => app.quit() }
    ])
  )
}

function registerMediaKeys(): void {
  const bindings: Array<[string, RemoteCommand]> = [
    ['MediaPlayPause', 'play-pause'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'previous'],
    ['MediaStop', 'stop']
  ]
  for (const [accelerator, command] of bindings) {
    try {
      globalShortcut.register(accelerator, () => sendCommand(command))
    } catch {
      // 媒体键可能被其他播放器占用，忽略即可。
    }
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.stateLoad, async () => {
    const state = await loadState()
    // 恢复曲库读取白名单，否则重启后已导入歌曲会 403。
    for (const track of state.imported) allowRoot(dirname(track.path))
    allowRoot(join(app.getPath('userData'), 'covers'))
    return state
  })
  // 注意：渲染层用 send 单向上报，必须用 ipcMain.on 接收（handle 只响应 invoke）
  ipcMain.on(IPC.stateSave, (_event, patch: Partial<AppState>) => {
    saveState(patch)
  })
  ipcMain.handle(IPC.statePath, () => statePath())

  ipcMain.handle(IPC.libraryPickFiles, () => pickFiles(mainWindow))
  ipcMain.handle(IPC.libraryPickFolder, () => pickFolder(mainWindow))
  ipcMain.handle(IPC.libraryResolvePaths, (_event, paths: string[]) => importPaths(paths))
  ipcMain.handle(IPC.libraryReadLyrics, (_event, path: string) => readLyrics(path))
  ipcMain.handle(IPC.libraryPickLyrics, () => pickLyricsFile(mainWindow))
  ipcMain.handle(IPC.libraryCheck, (_event, paths: string[]) => checkPaths(paths))
  ipcMain.handle(IPC.libraryReveal, (_event, path: string) => revealInFolder(path))

  // 在线榜单：渲染层的 CSP 不放行 connect-src，取数必须在主进程完成
  ipcMain.handle(IPC.chartsFetch, (_event, genre: string, period: string) =>
    fetchChart(genre, period)
  )

  // 电台目录同样在主进程取数（渲染层 CSP 不放行 connect-src）
  ipcMain.handle(IPC.radioChannels, (_event, force: boolean) => fetchRadioChannels(force))

  ipcMain.handle(IPC.windowMinimize, () => mainWindow?.minimize())
  ipcMain.handle(IPC.windowToggleMaximize, () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle(IPC.windowClose, () => mainWindow?.close())
  ipcMain.handle(IPC.windowIsMaximized, () => mainWindow?.isMaximized() ?? false)
  // 主题切换同步窗口底色，避免 resize/全屏时露出异色边缘
  ipcMain.on(IPC.windowThemeBackground, (_event, color: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(color)) mainWindow?.setBackgroundColor(color)
  })

  ipcMain.on(IPC.playerReportState, (_event, payload: PlayerSyncPayload) => {
    nowPlaying = {
      title: payload.title,
      artist: payload.artist,
      isPlaying: payload.isPlaying
    }
    refreshTray()
    broadcastSync(payload)
    // 任务栏覆盖图标：播放中显示应用图标，暂停移除
    if (mainWindow) {
      const title = payload.title
        ? `${payload.title} · ${payload.artist || '声屿音乐'}`
        : '声屿音乐'
      mainWindow.setTitle(title)
      // 任务栏进度条：暂停时清除
      if (!payload.isPlaying) {
        mainWindow.setProgressBar(-1)
      }
      // 任务栏缩略图按钮（酷狗式悬停控制）
      mainWindow.setThumbarButtons([
        {
          tooltip: '上一首',
          icon: nativeImage.createFromPath(thumbPrev),
          click: () => sendCommand('previous')
        },
        {
          tooltip: payload.isPlaying ? '暂停' : '播放',
          icon: nativeImage.createFromPath(payload.isPlaying ? thumbPause : thumbPlay),
          click: () => sendCommand('play-pause')
        },
        {
          tooltip: '下一首',
          icon: nativeImage.createFromPath(thumbNext),
          click: () => sendCommand('next')
        }
      ])
    }
  })

  // 渲染层节流上报进度：任务栏进度条 + 同步给迷你窗
  ipcMain.on(IPC.playerProgress, (_event, progress: { position: number; duration: number }) => {
    if (!mainWindow || !nowPlaying.isPlaying) return
    const ratio =
      progress.duration > 0 ? Math.min(1, Math.max(0, progress.position / progress.duration)) : 0
    mainWindow.setProgressBar(ratio)
    if (lastSync) {
      lastSync = { ...lastSync, position: progress.position, duration: progress.duration }
      miniWindow?.webContents.send(IPC.playerSync, lastSync)
    }
  })

  // 迷你窗的控制指令：转发为广播（主窗/迷你窗都会响应）
  ipcMain.on(IPC.playerCommand, (_event, command: RemoteCommand) => {
    sendCommand(command)
  })

  ipcMain.handle(IPC.windowEnterMini, () => {
    enterMiniMode()
  })
  ipcMain.handle(IPC.windowExitMini, () => {
    exitMiniMode()
  })
  ipcMain.handle(IPC.windowEnterDesktopLyrics, () => {
    enterDesktopLyrics()
  })
  ipcMain.handle(IPC.windowExitDesktopLyrics, () => {
    exitDesktopLyrics()
  })

  // 主窗歌词行上报 → 广播给桌面歌词窗
  ipcMain.on(
    IPC.lyricsLine,
    (_event, line: { current: string; next: string; words: string[]; wordIndex: number }) => {
      lastLyricLine = line
      if (lyricsWindow) lyricsWindow.webContents.send(IPC.lyricsLine, line)
    }
  )

  // 歌词颜色 → 同步给桌面歌词窗
  ipcMain.on(IPC.lyricsColor, (_event, color: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(color ?? '')) return
    lastLyricsColor = color
    if (lyricsWindow) lyricsWindow.webContents.send(IPC.lyricsColor, color)
  })

  // 桌面歌词窗主动拉取当前颜色（解决 ready-to-show 推送与动态 import 的竞态）
  ipcMain.handle(IPC.lyricsGetColor, () => lastLyricsColor)

  ipcMain.handle(IPC.appVersions, () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: `${process.platform} ${process.arch}`
  }))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.shengyu.music')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    handleMediaProtocol()
    registerIpc()
    registerMediaKeys()
    createWindow()
    buildTray()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', async (event) => {
  globalShortcut.unregisterAll()
  tray?.destroy()
  tray = null
  // 保证最后一次状态（音量、进度）落盘。
  event.preventDefault()
  await flushState()
  app.exit(0)
})

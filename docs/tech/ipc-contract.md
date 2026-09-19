# 主进程 ↔ 渲染进程契约

> 通道名与类型统一定义在 `src/shared/ipc.ts`（两边 import 同一份常量，杜绝字符串漂移）。
> 渲染层唯一能力入口是 `window.shengyu`（见 `src/preload/index.ts`），不暴露任何 Node/Electron 原始对象。

## 1. 通道一览

| 通道 | 方向 | 类型 | 说明 |
| ---- | ---- | ---- | ---- |
| `state:load` | R→M invoke | `AppState` | 读取持久化状态（含曲库白名单恢复） |
| `state:save` | R→M send | `Partial<AppState>` | 防抖写入 state.json |
| `state:path` | R→M invoke | `string` | state.json 绝对路径（设置页展示） |
| `library:pick-files` | R→M invoke | `ImportResult` | 系统对话框选文件导入 |
| `library:pick-folder` | R→M invoke | `ImportResult` | 系统对话框选文件夹导入 |
| `library:resolve-paths` | R→M invoke | `ImportResult` | 拖放路径导入（复用扫描管线） |
| `library:check` | R→M invoke | `Record<path, exists>` | 启动时校验曲库文件是否仍在 |
| `library:read-lyrics` | R→M invoke | `string \| null` | 读取 .lrc 侧车（UTF-8/GBK 自适应） |
| `library:reveal` | R→M invoke | — | 资源管理器定位文件 |
| `window:minimize / toggle-maximize / close / is-maximized` | R→M invoke | — | 无边框窗口控制 |
| `window:maximized-changed` | M→R send | `boolean` | 双击标题栏等操作引发的最大化状态同步 |
| `player:report-state` | R→M send | `{title, artist, isPlaying}` | 托盘提示与窗口标题 |
| `player:remote-command` | M→R send | `RemoteCommand` | 托盘菜单 / 全局媒体键指令 |
| `app:versions` | R→M invoke | `AppVersions` | 关于页版本信息 |

`RemoteCommand = 'play-pause' | 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'like' | 'volume-up' | 'volume-down'`

## 2. 持久化状态（userData/state.json）

```ts
interface AppState {
  version: 1
  playback: {
    trackId: string | null   // 上次播放曲目
    position: number         // 上次进度（秒）
    volume: number; muted: boolean
    shuffled: boolean; repeat: 'off' | 'all' | 'one'
    queue: string[]          // 队列曲目 ID
    queueLabel: string       // 队列来源标签
  }
  imported: LocalTrackMeta[] // 本地曲库（元数据，启动秒开）
  liked: string[]
  recent: { id: string; at: number; count: number }[]
  playlists: PersistedPlaylist[]
  equalizer: { enabled: boolean; preset: string; gains: number[] }
  settings: { crossfade: boolean; restoreOnLaunch: boolean; trayEnabled: boolean; theme: string }
}
```

- 写入：原子写（tmp + rename）+ 500ms 防抖；读取失败回落默认值。
- 渲染侧 hydrate 顺序：`hydrateLibrary()` → `validateLocalFiles()` → `hydrateUi()` → `hydratePlayer()` → `bindRemoteCommands()`。

## 3. 媒体协议 `shengyu-media://`

- 注册为特权 scheme：`standard / secure / stream / supportFetchAPI / corsEnabled`。
- URL 形如 `shengyu-media://stream/?src=<base64url(绝对路径)>`，中文路径与反斜杠安全。
- **Range 支持**：解析 `Range: bytes=a-b`，返回 206 + `Content-Range` + `Accept-Ranges`，`<audio>` 拖动进度依赖它。
- **白名单**：仅允许「用户导入过的目录 + userData/covers」内的文件，扩展名限定音频/图片/lrc，否则 403。
- **CORS**：`Access-Control-Allow-Origin: *`，配合渲染层 `crossOrigin="anonymous"`。

## 4. 安全边界

- 渲染层 `webSecurity: true` 不放开；`sandbox: false` 仅为沿用 electron-toolkit 预加载模板。
- IPC 入参全部做类型/白名单校验（路径在协议层拦截，扫描深度与文件数上限在 library 层拦截）。
- 渲染层崩溃不影响主进程；托盘与媒体键照常工作。

# 计划：声屿音乐 V1 —— 从交互原型到真实可播放

- 日期：2026-08-29
- 版本目标：1.1.0（V1「可用播放器」）
- 状态：已实施（详见 `docs/product/feature-matrix.md`）

## 1. 问题定位

V0 是一个**纯界面原型**，"音乐不能播放"是必然结果，根因有三处：

| 位置                                     | 现状                                                        | 后果                       |
| ---------------------------------------- | ----------------------------------------------------------- | -------------------------- |
| `src/renderer/src/data/catalog.ts`       | `Track` 没有任何音源字段（无 `src` / 无文件路径）           | 没有可播放对象             |
| `src/renderer/src/App.vue` `startTimer()` | 用 `setInterval` 每秒 `progress += 1` 假装在播放            | 进度会走，但完全没有声音   |
| `src/main/index.ts`                      | 只有窗口创建 + `ipcMain.on('ping')` 模板代码                | 无法访问本地音频文件       |

结论：不是"某个开关没打开"，而是**播放层完全缺失**。V1 需要补齐整条链路：
音源 → 解码/合成 → 音频图 → 播放状态 → UI。

## 2. 方案选择

### 2.1 音源策略（双轨）

| 轨道         | 用途                            | 技术                                                     |
| ------------ | ------------------------------- | -------------------------------------------------------- |
| **本地文件** | 用户真实歌曲，V1 的主路径       | `HTMLAudioElement` + `MediaElementAudioSourceNode`       |
| **生成式演示音源** | 内置 6 首演示曲开箱即响，零版权、零体积 | 纯 Web Audio 程序化合成（振荡器 + 噪声 + 卷积混响）      |

选择理由：
- 只做本地导入 → 首次启动仍然"点了播放没声音"，问题只解决一半。
- 打包真实音频文件 → 版权风险 + 安装包膨胀（一首 WAV ≈ 5MB/30s）。
- 生成式音源用约 300 行代码换来 6 首**确定性可复现**的环境音乐，且能演示进度、拖动、切歌、频谱、歌词全链路。

两种音源实现同一个 `PlaybackSource` 接口，播放引擎对上层完全屏蔽差异。

### 2.2 本地文件如何送进渲染进程

不用 `file://`（开发态渲染进程是 `http://localhost`，跨协议会被拦；且直接放开 `webSecurity` 不可接受）。
改为注册自定义特权协议 `shengyu-media://`：

- `protocol.registerSchemesAsPrivileged` 声明 `standard/secure/stream/supportFetchAPI/corsEnabled`。
- `protocol.handle` 手写 **HTTP Range** 支持（206 + `Content-Range` + `Accept-Ranges`），否则 `<audio>` 无法拖动进度。
- 路径白名单：只允许用户导入过的根目录 + 封面缓存目录，且扩展名必须在音频/图片白名单内，防止渲染层任意读盘。
- 返回 `Access-Control-Allow-Origin: *`，配合 `crossOrigin="anonymous"`，保证 `createMediaElementSource` 不会因跨源污染而静音。

### 2.3 状态持久化

主进程 `userData/state.json`（原子写 + 防抖），保存音量、播放模式、收藏、歌单、导入曲库、EQ、上次播放位置。
不引入 SQLite（V1 数据量小），也不引入 Pinia（用 `reactive` 单例 store 即可，遵循原规划"不提前加依赖"）。

## 3. 分层设计

```text
主进程 src/main
├─ index.ts            应用生命周期、窗口、托盘、媒体键、IPC 注册
├─ media-protocol.ts   shengyu-media:// 流式协议（Range/白名单/MIME）
├─ metadata.ts         ID3v2 / FLAC / MP4 / WAV 标签与内嵌封面解析
├─ library.ts          文件与文件夹选择、递归扫描、.lrc 侧车发现
└─ state-store.ts      userData/state.json 读写

桥接 src/preload      contextBridge 暴露 window.shengyu（强类型、无 Node 泄漏）
契约 src/shared/ipc.ts 通道名 + 主/渲染共用类型

渲染进程 src/renderer/src
├─ services/
│  ├─ audio-engine.ts  AudioContext、EQ、Analyser、音量淡入淡出、事件总线
│  ├─ synth-source.ts  生成式音源（确定性乐句调度器）
│  ├─ media-source.ts  文件音源（含 Web Audio 静音自检与降级）
│  └─ lrc.ts           LRC 解析
├─ stores/             player / library / ui（reactive 单例）
├─ composables/        useShortcuts、useVisualizer
└─ components/         PlayerBar、NowPlayingView、LyricsPane、Visualizer、
                       QueuePanel、TrackList、TrackMenu、EqualizerPanel、
                       ToastStack、PromptDialog、WindowControls、AppIcon、CoverArt
```

约束：组件不直接碰 IPC，统一走 store；store 不直接碰 DOM 音频，统一走 `audio-engine`。

## 4. 功能清单（本次交付）

播放内核

1. 真实音频播放：本地文件（MP3/FLAC/WAV/M4A/OGG/AAC/OPUS/WMA）
2. 生成式演示音源：6 首内置曲目各自的调式/BPM/织体/鼓型
3. 真实进度、拖动定位、时长（来自音频时钟，不再是假计时器）
4. 音量 + 静音 + 60ms 淡入淡出（消除爆音）
5. 5 段均衡器 + 5 个预设（平直/流行/摇滚/人声/夜间）
6. 播放结束自动切歌；单曲循环 / 列表循环 / 随机 / 顺序
7. 加载态、解码失败态、文件丢失态（Toast + 行内标记）

曲库与队列

8. 导入文件 / 导入文件夹（递归扫描）
9. 拖放导入（窗口内拖入音频文件或文件夹）
10. 标签解析：ID3v2.3/2.4、FLAC Vorbis Comment、MP4 atom、WAV，失败回落"艺人 - 标题"文件名解析
11. 内嵌封面提取 → 缓存到 `userData/covers` 并经协议返回
12. 时长探测（导入后并发探测真实时长并回写）
13. 播放队列：下一首播放、加入队列、移除、清空、拖拽排序
14. 歌单 CRUD：新建、重命名、删除、加入歌曲、移出歌曲、歌单详情页
15. 我喜欢、最近播放（含播放次数与时间）
16. 曲库排序（标题/艺人/时长/添加时间）与来源筛选（全部/本地/演示）
17. 搜索覆盖本地曲库、演示曲、歌单、艺人、专辑

体验与桌面集成

18. 沉浸播放页：大封面、实时频谱、逐行歌词
19. 歌词：`.lrc` 侧车解析 + 演示曲内置时间轴；点击歌词跳转
20. 实时频谱可视化（播放条迷你版 + 播放页全幅版，`prefers-reduced-motion` 降级）
21. 无边框窗口 + 自定义窗口控制 + 拖拽区
22. 系统托盘：播放控制菜单、点击唤起
23. 全局媒体键 + 应用内快捷键（空格/←→/↑↓/M/L/Q/N/E/Ctrl+K/Esc/F11 等）
24. 睡眠定时器（15/30/60 分钟，淡出停止）
25. 设置页：播放、EQ、导入目录管理、快捷键表、存储位置、关于
26. Toast 通知系统
27. 状态持久化与启动恢复（恢复上次曲目与进度，默认不自动播放）
28. 单实例锁；开发态渲染日志转发到终端（便于验证音频链路）

## 5. 验收标准

- [x] `npm run typecheck` 通过（node + web）
- [x] `npm run lint` 无 error
- [x] 启动后点击播放：演示曲有真实声音，`AnalyserNode` RMS > 0（开发态日志可验证）
- [x] 导入本地 MP3/FLAC：能播放、能拖动进度、标签与封面正确
- [x] 关闭再启动：音量、模式、收藏、歌单、导入曲库、上次进度都还在
- [x] 队列拖拽排序后播放顺序正确
- [x] 无边框窗口的最小化/最大化/关闭与拖拽正常

## 6. 有意不做（留给 V2/V3）

- 在线曲库与账号（需合法授权，见原规划 V3）
- SQLite 索引（V1 JSON 足够，曲库过千再迁移）
- 桌面歌词独立窗口、迷你播放器窗口
- 音频指纹去重、ReplayGain 音量归一化
- 逐字（卡拉OK）歌词

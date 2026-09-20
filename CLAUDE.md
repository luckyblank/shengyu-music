# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本代码库中工作时提供指引。

## 项目

声屿音乐 —— 基于 Electron + Vue 3 + TypeScript、由 electron-vite 构建的桌面音乐播放器。界面文案、代码注释与文档一律使用简体中文，修改时请保持一致。本仓库已初始化为 git 仓库（远程 `luckyblank/shengyu-music`，默认分支 `main`；提交署名见[提交约定](#提交约定)），但**没有测试套件**（无 vitest/jest/playwright，无 `test` 脚本）—— 验证靠手动运行 `npm run dev`。

有几处「缺失」是刻意的，不是待办：没有 vue-router、没有 Pinia、没有 SQLite —— 项目规划的原则是「不提前加依赖」，V1 的实施计划明确否决了这三者。除非用户要求改变，否则继续使用现有的 `activePage` ref、模块级 ref 与 `state.json`。

## 代码检索 —— 用 CodeGraph，不要用 grep

**在本仓库定位代码时，不要使用 `grep`、`rg`、`find`，也不要用 Grep/Glob 工具。** 本仓库已由 CodeGraph 建索引（根目录 `.codegraph/`），它能返回磁盘上逐字一致的源码，外加符号周围的调用链与调用方数量 —— 这是文本搜索给不了的。

```bash
codegraph explore "<符号名或一句自然语言问题>"   # 首选：一次拿到相关源码 + 调用链
codegraph node <符号或文件>                      # 单个符号的源码 + 调用方，或整份文件
codegraph query <关键词> [-k function] [-l 20] [-j]   # 符号检索
codegraph callers <符号>   # 谁调用它
codegraph callees <符号>   # 它调用谁
codegraph impact <符号>    # 改动它会影响什么
codegraph files [--filter src/main] [--pattern '*.ts'] [--format flat]   # 从索引取项目结构
codegraph status           # 索引覆盖情况
codegraph sync             # 增量重建索引；全量用 init
```

若当前会话已加载 CodeGraph MCP 服务，`codegraph_explore` / `codegraph_node` 与上述命令等价，优先用 MCP 工具；未加载时退回命令行。

文本搜索仅用于索引覆盖不到的内容 —— Markdown 文档、CSS、JSON、界面文案。**绝不要**用它查找函数、文件或符号。

## 常用命令

```bash
npm install          # postinstall 会执行 electron-builder install-app-deps

npm run dev          # electron-vite dev：渲染层 HMR + 主进程/预加载重载
npm run build        # 先类型检查，再 electron-vite build → out/
npm run start        # electron-vite preview（运行已构建的 out/）
npm run typecheck    # typecheck:node (tsc) + typecheck:web (vue-tsc)
npm run lint         # eslint --fix，覆盖 .js/.ts/.vue
npm run format       # prettier --write .

npm run build:win    # electron-builder 打包安装程序（另有 :mac、:linux）
npm run build:unpack # 免安装目录构建，便于检查打包产物
```

`.npmrc` 固定了 npmmirror 的 Electron 镜像（国内网络）。npm 11 会为这几个键打印 `Unknown project config` 警告，无害。没有 `npm run release` 脚本。

### 没有测试套件，如何验证改动

`npm run dev` 就是反馈回路，并且已经为验证做了埋点：

- 渲染层的 `console.*` 会转发到终端，前缀 `[renderer] …`（仅开发态，[index.ts:86](src/main/index.ts#L86)）。迷你窗与桌面歌词窗的前缀是 `[mini-renderer]`。
- 播放中引擎每 5 秒打印一次 `[engine] RMS=…`（[audio-engine.ts:300](src/renderer/src/services/audio-engine.ts#L300)）。出现 `RMS=null(降级)` 表示该音源已退化为直连播放，即没有真实频谱。
- 根目录的 `dev-verify.log` 是一次 `npm run dev` 启动日志的留存 —— 这是本项目记录验证过程的惯例。
- [.vscode/launch.json](.vscode/launch.json) 可调试主进程与渲染进程（渲染进程 attach 9222 端口）。

**验收必须在全新启动下进行。** [docs/product/evolution.md](docs/product/evolution.md) 记录过：长时间 HMR 会话会伪造出「面板打不开／关不掉」的假象。在热更新的开发会话里报出的面板问题往往并不存在，下结论前先重启。

## 架构

### 进程结构与路径别名

[electron.vite.config.ts](electron.vite.config.ts) 中配置了三个 electron-vite 目标。路径别名：`@shared` → `src/shared`（三个目标都有），`@renderer` → `src/renderer/src`（仅渲染层）。TypeScript 同构拆分：`tsconfig.node.json` 覆盖主进程/预加载/shared，`tsconfig.web.json` 覆盖渲染层。主进程与预加载使用 `externalizeDepsPlugin()` **加** `bytecodePlugin()`（生产构建产出 V8 字节码）。

### 分层规则

[plan/2026-08-29-real-playback-v1.md](plan/2026-08-29-real-playback-v1.md) 中写明：**组件不直接碰 IPC —— 统一走 store；store 不直接碰 DOM 音频 —— 统一走 audio-engine。** 加功能时请遵守，正是这条规则让引擎可复用（迷你窗/歌词窗用到它，却完全不含播放代码）。

### IPC 契约 —— `src/shared/ipc.ts`

跨进程边界的一切都以它为准：`IPC` 通道名常量，以及全部共享类型（`AppState`、`LocalTrackMeta`、`PlayerSyncPayload`、`RemoteCommand`、`AUDIO_EXTENSIONS`、`MEDIA_SCHEME`）。它**只放类型与常量，不放实现**，避免任何一侧引入另一侧的运行时依赖。

新增一个通道要动三个文件：[shared/ipc.ts](src/shared/ipc.ts) 的 `IPC` 常量、[main/index.ts](src/main/index.ts) 的 `registerIpc()` 处理器、[preload/index.ts](src/preload/index.ts) 里 `api` 对象上的方法。

预加载只暴露一个入口 —— `window.shengyu`，类型为 `ShengyuApi`（[preload/index.d.ts](src/preload/index.d.ts)）。渲染层拿不到任何 Node/Electron 原始对象。

**方向很重要。** 渲染层→主进程的上报是单向的（`ipcRenderer.send` / `ipcMain.on`）；请求-响应才是 `invoke` / `handle`。用 `handle` 去接 `send` 会静默不触发 —— 见 [index.ts:282](src/main/index.ts#L282) 的注释。预加载的 `send`/`invoke` 包装层会打印失败与出错的载荷，而不是无声抛掉。

### `shengyu-media://` 协议

渲染层不能直接读盘，本地音频与封面统一走这个自定义协议（[main/media-protocol.ts](src/main/media-protocol.ts)）。它在 `app.whenReady()` **之前**声明为特权协议。两道有实际约束力的白名单：扩展名，以及由 `allowRoot()` 维护的**目录根白名单**；白名单之外的路径一律 403。

两处行为是承重的：

- 手写的 HTTP `Range` 支持 —— 没有它，`<audio>` 的拖动进度会直接失败。
- 返回 `Access-Control-Allow-Origin: *`，使 `createMediaElementSource` 不因跨源污染而静音。

渲染层若要读取新目录，必须在主进程侧 `allowRoot()`。启动流程会把每个已导入曲目的目录重新加回白名单，正是为此（[index.ts:278](src/main/index.ts#L278)）—— 少了这步，重启后已导入的歌曲会 403。

### 本地曲库导入

[main/library.ts](src/main/library.ts) 负责扫描（深度 ≤ 6、文件数 ≤ 4000，跳过 `node_modules`/`.git`/回收站）；[main/metadata.ts](src/main/metadata.ts) 只读所需的头部字节来解析标签（ID3v2/ID3v1、FLAC、MP4/M4A、WAV）。抽出的封面缓存在 `userData/covers`；`.lrc` 侧车文件在音频文件旁自动发现。

两层都是「尽力而为」的设计：单个文件失败只累加 `skipped`，绝不中断整批；标签解析失败一律回落到文件名。扩展时请保持这一性质。

### 渲染层：无路由、纯 ref store

导航是 [stores/ui.ts](src/renderer/src/stores/ui.ts) 里的一个 `activePage` ref 加一个 `history` 数组（`navigate()` / `goBack()`）。页面标识是 [types/music.ts](src/renderer/src/types/music.ts) 的 `AppPage` 联合类型。`goBack()` 没有对应的前进实现 —— 前进按钮是永久禁用的。

有两样东西挂在 `activePage` 旁边，而不是页面：`currentPlaylistId`（App.vue 的局部 ref）与 `ui.artistPage`。

状态放在模块级 Vue ref 里 —— **没有 Pinia**。三个 store：`player.ts`（队列/播放模式 + 引擎桥接）、`library.ts`（曲目、歌单、收藏、最近播放、歌词挂载）、`ui.ts`（导航、面板、Toast、均衡器/音效、主题、睡眠定时器）。非组件代码（库回调、远程指令）通过 [stores/ui.ts](src/renderer/src/stores/ui.ts) 末尾声明的 `window.ui` / `window.player` 全局出口来弹提示与确认框。

**页面是 App.vue 里的一张组件映射表 `PAGES`**（`Record<AppPage, Component>`，配 `<component :is="…" :key="activePage">`）。此前是 `v-if`/`v-else-if` 链、设置页收在末尾的 `v-else`，于是守卫不成立的页面会**静默渲染成设置页**（`activePage === 'playlist'` 而 `currentPlaylistId` 为空时显示的就是设置页）；改成映射表后，缺数据的空态由各页面自己给。新增页面需要动：`AppPage` 联合类型、`PAGES` 表、`pageTitle` 映射表（[ui.ts:187](src/renderer/src/stores/ui.ts#L187)），以及一个侧栏入口。页面本身不再可恢复 —— 每次启动一律落在发现音乐。

**面板互斥。** queue / lyrics / equalizer / nowPlaying / mv 共用同一个 `panelRefs` 记录；请走 `openPanel()` / `togglePanel()`（[ui.ts:107-142](src/renderer/src/stores/ui.ts#L107)）。直接给面板 ref 赋值会让面板互相遮挡。面板在每次启动时与按 Escape 时都会被强制收起。

### 音频引擎

[services/audio-engine.ts](src/renderer/src/services/audio-engine.ts) 是唯一持有 `AudioContext` 的地方，以单例 `engine` 导出。它不依赖 Vue；状态经自身的事件发射器上抛，由 `stores/player.ts` 翻译成响应式 ref。引擎只知道「当前这首」，「下一首放什么」是队列策略，属于 store。

信号链：

```
source → bus → EQ（5 段 peaking：60/250/1k/4k/12k）→ masterGain → fxInsert → analyser → destination
```

`fxInsert` 是音效预设（现场/纯净人声/重低音/3D环绕）的插入点，每次切换都整体重建。

它背后是两个可互换的音源实现：

- **`SynthSource`** —— 6 首内置演示曲根本不是音频文件。它们由 `SynthRecipe`（bpm、调式、和弦进行、织体、打击乐密度）程序化合成，所有随机决策都来自确定性的 `(seed, bar, step)` 哈希，并以 120ms 提前量排入 600ms 的窗口。正是这份确定性让同一首曲子每次播放完全一致，**也**让拖动到任意进度与从头播放落在同一乐句上。请保持它。
- **`MediaSource`** —— 用于本地、在线与电台曲目的 `HTMLAudioElement`。它带一个**静音自检**：若播放位置在前进而分析器 4 秒内读数 ≈0 RMS，就判定为跨源静音，重建元素并脱离 Web Audio 图（「直连模式」）以保证一定有声（[media-source.ts:107](src/renderer/src/services/media-source.ts#L107)）。代价是没有真实频谱 —— `liveSignal` 变 false，可视化切到伪频谱。注意电台是海外公播流的直连播放，因此**没有均衡器、没有音效、也没有真实频谱**；这是已知设计，不是 bug。

`Track.cors` 按在线音源逐个开启，因为对不发 ACAO 头的域名设置 `crossOrigin='anonymous'` 会让整个文件加载失败。

时长未知时，引擎会在加载后把真实时长回写到响应式曲目对象上；电台流的 duration 为 `Infinity`，跳过。

### 多窗口

一个渲染层产物服务三个入口，在 [renderer/src/main.ts](src/renderer/src/main.ts) 引导时按 `query.has('mini')` / `query.has('desktop-lyrics')` 选择（判断存在，不是 `=== '1'`）：`MiniPlayer.vue`、`DesktopLyrics.vue`，否则 `App.vue`。App.vue 里没有迷你模式分支 —— 它只在主窗口中运行。

**主进程是枢纽。** 它缓存 `lastSync` / `lastLyricLine` / `lastLyricsColor`，并在每个窗口 `ready-to-show` 时补发；歌词窗还可以用 `lyricsGetColor` 主动拉取，以抢在推送与 `ready-to-show` 的竞态之前。迷你窗与歌词窗里不跑播放 —— 它们只是视图加指令发送方，通过 `player:command` → 广播回传。

### 持久化

[main/state-store.ts](src/main/state-store.ts) 在 `userData/state.json` 维护唯一一份 `AppState`。写入是原子的（先写 tmp 再 rename），带 500ms 防抖，并用 `migrate()` 回落到默认值，保证坏档不会卡住启动。渲染层还有两层防抖（播放器 600ms、曲库 300ms）。`will-quit` 时强制落盘再 `app.exit(0)`。

局部补丁按 `window.shengyu.saveState({ settings: { … } } as never)` 的写法提交 —— 那个 `as never` 是这类窄补丁的既定写法，不是笔误。

### 主题

语义化 CSS 自定义属性定义在 [assets/base.css](src/renderer/src/assets/base.css)，通过 `<html>` 上的 `data-theme` 切换。[docs/product/design-system.md](docs/product/design-system.md) 里两条硬性规则：**硬编码色值只允许出现在 base.css 的 `:root` 与 `:root[data-theme='light']` 两块里**；任何新增页面/面板必须从设计体系取令牌，禁止自创颜色或间距（封面渐变除外）。亮色主题重新定义的是同一批 `--ink-*` / `--paper-*` 变量名 —— 深色那些值是**默认值**，不是「深色主题专属值」。卡片阴影统一取 `--shadow-card` 这一档。

图标一律走 [AppIcon.vue](src/renderer/src/components/AppIcon.vue)（24×24 viewBox、线宽 1.8）—— 不用 emoji，不用位图图标。按钮使用既有的四档，不要新增。

`applyTheme()` 还会把窗口底色推给主进程，避免缩放时闪色；`stores/ui.ts` 里的 `THEME_BG` 必须与 base.css 中两种主题的 `--ink-950` 保持一致。用户可自定义的歌词色是另一个变量 `--lyrics-color`，会广播给桌面歌词窗。

### 歌词

读取优先级为**手动挂载 > 演示曲内置 > 本地 `.lrc` 侧车 > 空态**（[plan/2026-08-29-followup-polish.md](plan/2026-08-29-followup-polish.md)）。[services/lyrics-tracker.ts](src/renderer/src/services/lyrics-tracker.ts) 全局运行、独立跟随播放，因此歌词面板关闭时桌面歌词窗照常工作。逐字（卡拉OK）时间轴在没有逐字标签时按行时长均匀分布生成 —— 不是真实逐字时间。

## 约定

- **Vue 响应式代理无法跨 `contextBridge` 结构化克隆。** 交给 `window.shengyu.saveState(...)` 的任何数组/对象都必须先展开成普通值。[player.ts:123](src/renderer/src/stores/player.ts#L123) 与 [library.ts:275](src/renderer/src/stores/library.ts#L275) 已经这样处理 —— 忘了它就是新增「could not be cloned」报错最可能的来源。
- Toast 一律用 `ui.toast(message, kind)`（`info|success|warning|error`），由 `<ToastStack />` 全局渲染一次，不要自己造。确认框用 `await window.ui.ask(title, message)`，由 `PromptDialog.vue` 通过 `sy-ask` 事件渲染。（有一处不一致：`renameCurrentPlaylist` 至今仍用原生 `window.prompt()`。）
- 全局按键处理在 [composables/useGlobalShortcuts.ts](src/renderer/src/composables/useGlobalShortcuts.ts)：`handleKeydown` 与 `SHORTCUTS` 键位表**同处一文件**，设置页的快捷键卡片直接渲染 `SHORTCUTS`，所以加绑定只改这一处，不会再出现「处理器改了、设置页没改」。它的 `INPUT`/`TEXTAREA` 输入守卫**不覆盖** `contenteditable` 与 `<select>`，且空格在修饰键判断之前处理 —— Ctrl+Space 也会切换播放，这是既有行为。
- Prettier：不加分号、单引号、100 列、无尾逗号、2 空格缩进、LF（[.prettierrc.yaml](.prettierrc.yaml)、[.editorconfig](.editorconfig)）。
- 注释用简体中文且解释**为什么** —— 常常直接点出这一行在防的是哪个具体故障（例如「响应式代理无法跨 contextBridge 克隆，必须展开为普通数组」）。保持这个风格；单纯复述代码不是本仓库的写法。
- window 上的全局类型声明在 `stores/ui.ts` 的 `declare global` 里 —— 扩展它，不要动辄用 `any`。

## 提交约定

- **提交一律用本机身份署名**：作者与提交者都取 `git config user.name` / `user.email`（本仓库为 `luckyblank <luckyblank@163.com>`）。不要用 `--author` 把身份改成工具或别人 —— 提交历史该记的是真人。
- **提交信息里不要加 `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` 或任何同类的协作者尾巴**，工具不算协作者。
- 已经推到 `origin/main` 的提交，不要为了去掉尾巴去改写历史（那需要 force push）—— 先问用户。

## 文档地图

项目把设计记录留在仓库内，README 的更新日志是对外的版本历史。改动了文档所描述的行为，就同步更新对应文档。

- [docs/product/feature-matrix.md](docs/product/feature-matrix.md) —— 功能矩阵与交付状态；**声明的唯一事实来源**，说明哪些确实已交付。它还带一份「诚实的局限」清单，值得在承诺某功能之前读一读。
- [docs/product/music-player-plan.md](docs/product/music-player-plan.md) —— 产品/技术路线 V0–V3
- [docs/product/design-system.md](docs/product/design-system.md) —— 色彩/字体/间距/封面/动效令牌
- [docs/product/evolution.md](docs/product/evolution.md) —— 优化建议与技术债清单（P1 建议：曲库过千首后上 SQLite、无缝播放、ReplayGain）。大重构前先读。
- [docs/product/netease-benchmark.md](docs/product/netease-benchmark.md) —— 竞品功能对照
- [docs/tech/audio-engine.md](docs/tech/audio-engine.md) / [docs/tech/ipc-contract.md](docs/tech/ipc-contract.md) —— 引擎与 IPC 参考
- [plan/](plan/) —— 各版本实施计划归档
- [docs/product/prototypes/](docs/product/prototypes/) —— 参考截图，命名 `music-player-<page>-v<n>.png`

### 这些文档已与代码脱节 —— 信任前先核对

- **`design-system.md`：以 §0（V1.4）为准，不要看 §1。** §1 的令牌表已过期（`--accent` 现为 `#ec4141`，`--ink-950` 为 `#0d2024`），§2/§3 的行高与 §0 冲突，§4 的渐变封面如今只是最终回退（v1.3.3 起换成了真实图片），§7 仍在推荐 v1.3.6 已弃用的 `writing-mode: vertical-lr` 均衡器滑杆方案。令牌的实际事实来源是 [assets/base.css](src/renderer/src/assets/base.css)。
- **`ipc-contract.md` 记录 15 个通道，而 [shared/ipc.ts](src/shared/ipc.ts) 定义了 29 个。** 它的 `AppState.settings` 也漏了 `theme`、`fx`、`lyricsColor`、`searchHistory`。
- **`feature-matrix.md` 的版本表停在 V1.3**，README 更新日志已到 v1.5.1；`main.css` 也已涨到 3000 行以上并叠了多段覆盖块（evolution 文档里的第 1 号技术债）。

## 打包说明

[electron-builder.yml](electron-builder.yml)：appId `com.shengyu.music`，productName 声屿音乐，Windows 可执行文件名 `ShengyuMusic`。NSIS 配成辅助式安装（非一键），让用户可选安装目录。`resources/**` 走 asar 解包，并启用了 ASAR 完整性校验 / 仅从 asar 加载的 fuse。Electron 下载走 npmmirror 镜像。

内置字体：界面使用霞鹜文楷 Screen，以 97 个 Unicode 分片 woff2 子集随包携带（[assets/fonts/](src/renderer/src/assets/fonts/)），经 `assets/fonts/lxgw-wenkai-screen.css` 加载 —— 改字体时请保留分片方案。

# 计划：V1.1 打磨 —— 清理、歌单重设计、歌词功能

- 日期：2026-08-29
- 版本目标：1.1.2
- 状态：已实施（详见 `docs/product/feature-matrix.md`）

## 1. 文件清理

| 文件 | 处置 | 原因 |
| ---- | ---- | ---- |
| `src/renderer/src/assets/electron.svg` | 删除 | electron-vite 模板遗留，无引用 |
| `src/renderer/src/assets/wavy-lines.svg` | 删除 | 同上 |
| `build/electron-vite-vue-ts.png` | 删除 | 模板 README 配图，README 已重写不再引用 |
| `dist/` | 删除 | 过期打包产物（v1.0.0），`build:win` 会重新生成 |
| `build/icon.ico` / `icon.png` | 重建 | 与新图标同步（打包资源） |
| `build/entitlements.mac.plist` | 重建 | macOS 签名配置，electron-builder.yml 引用 |

> 说明：`build/icon.icns` 为 macOS 专用图标，仅 `build:mac` 时读取，
> 缺失时 electron-builder 会自动从 512px PNG 生成，故不再保留旧文件。

## 2. 侧栏「我的歌单」重设计

问题：原设计行高 44px、无行距，5 个歌单挤成一团，标题与播放按钮难以定位。

方案（详见 `docs/product/design-system.md` 第 6 节）：

- 卡片式列表：行高 56px、行间 6px gap、封面 38px
- 悬浮反馈：封面 scale(1.06)、播放入口浮现、背景亮起
- 激活态：左侧 2px 珊瑚指示条（与主导航同语言）
- 标题行显示歌单计数（等宽字体徽标）

## 3. 歌词功能补齐

原有：沉浸播放页内嵌歌词（演示曲内置 + 本地 .lrc 侧车）。
本次补齐三块：

1. **悬浮歌词面板**（`LyricsPanel.vue`）：播放条歌词按钮开合；跟随当前播放时实时高亮/自动滚动/点击跳转；从曲目右键菜单进入时是"浏览模式"（不改变播放，标注"未在播放"）。
2. **歌词挂载**：任意曲目（演示/在线/本地）可通过系统对话框导入 .lrc；本地文件同时记录侧车路径，其余文本存入 `state.lyricsTexts` 持久化；可更换、可移除。
3. **读取优先级**：手动挂载 > 演示曲内置 > 本地 .lrc 侧车 > 空态提示导入。

主进程新增 `library:pick-lyrics` 通道；`LyricsPane` 增加 `track` 覆盖 prop（浏览模式）。

## 4. 验收

- [x] lint / typecheck / build 全绿
- [x] 干净启动零报错；歌词面板实机截图见 `docs/product/prototypes/music-player-lyrics-v1.png`
- [x] 演示曲歌词实时高亮 + 自动滚动
- [x] 挂载歌词文本写入 state.json 并可移除

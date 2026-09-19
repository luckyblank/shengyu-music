# 音频引擎架构

> 代码位置：`src/renderer/src/services/audio-engine.ts`（总线与调度）、
> `synth-source.ts`（生成式音源）、`media-source.ts`（本地文件音源）。

## 1. 音频图

所有来源共用一条总线，均衡器与分析器对所有声音生效：

```text
SynthSource ─┐
             ├─→ bus ─→ EQ(5×BiquadFilter) ─→ masterGain ─→ AnalyserNode ─→ destination
MediaSource ─┘        （60/250/1k/4k/12k Hz）    （音量/淡入淡出）      ↑
                                                                    每 50ms 推给频谱组件
```

- `AudioContext` 由引擎单例持有（`export const engine`），组件一律通过 `engine.on(...)` 订阅，不直接触摸节点。
- 状态变更走 `EngineEvents`（`state` / `ended` / `error` / `spectrum` / `rms` / `degraded`），引擎无任何 Vue 依赖。
- 位置推送：`requestAnimationFrame` 循环，每帧 `pushState()`；频谱按 50ms 节流。

## 2. 三种音源

### 2.1 本地文件（MediaSource）

- `HTMLAudioElement` + `createMediaElementSource`，`src` 指向 `shengyu-media://`。
- 元素设置 `crossOrigin = 'anonymous'`，协议层返回 `Access-Control-Allow-Origin: *`，避免跨源污染静音。
- 进度时钟：`audio.currentTime`；结束：`ended` 事件；失败：`error` 事件 + 8s 超时兜底。
- **静音自检（防降级兜底）**：播放开始后 4 秒窗口内，若 `currentTime` 已前进 2 秒以上但分析器 RMS < 0.0008，判定被静音 → 重建元素、断开 Web Audio 通路直连播放，并回调 `degraded`（UI 切换为伪频谱并如实标注）。

### 2.2 在线音源（MediaSource 复用）

在线曲目（`origin: 'remote'`）与本地文件共用 MediaSource，区别只在跨源策略：

- 目标域名支持 CORS（如 archive.org，已声明 `track.cors`）→ `crossOrigin='anonymous'` 进 Web Audio 图，享受 EQ/真实频谱/静音自检全套能力；
- 无 CORS（如 SoundHelix）→ 不设 `crossOrigin`（设了反而整首加载失败），静音自检 4 秒内检测到零信号后自动降级直连播放，UI 切换为呼吸波形；
- 时长回写：加载完成后把 `audio.duration` 写回曲目对象（响应式，进度条即时更新）；
- 超时余量：在线音源 25s（本地 8s），失败走统一错误 Toast。

### 2.3 生成式演示音源（SynthSource）

零音频文件的确定性合成：

- 每首演示曲在 `data/catalog.ts` 里只有一份 `SynthRecipe`：BPM、根音、调式（五声/多利亚/利底亚）、和弦进行（每 4 小节轮换）、织体（垫/拨弦/钟琴）、打击乐密度、亮度、混响。
- **确定性**：所有随机决策来自 `hash(曲目种子, 小节, 步)`，因此同一首曲子每次播放完全相同、从任意进度进入都落在一致乐句上（拖动/恢复可复现）。
- **调度器**：每 120ms 向未来 600ms 窗口排入 16 分音符步事件；曲目结束时由引擎时钟判尾。
- 音色库：垫（双振荡器失谐三角波）、拨弦（低通扫频）、钟琴（泛音列 1/2.76/5.4）、贝斯（正弦+次八度）、底鼓（扫频正弦）、踩镲（高通噪声），全部经卷积混响（2.4s 指数衰减脉冲响应）。

## 3. 时钟与淡入淡出

- 合成器时钟 = `ctx.currentTime - startAt + startPosition`；暂停时快照位置、杀掉发声中的 voice。
- 本地文件时钟 = `audio.currentTime`，暂停即 `pause()`。
- 音量/暂停/恢复统一走 `masterGain.setTargetAtTime`（≈60ms），杜绝爆音。
- 均衡器：5 个 peaking 滤波器，`setEqualizer(enabled, gains)` 以 50ms 时间常数平滑过渡。

## 4. 与上层的关系

```text
stores/player.ts（队列策略：随机/循环/下一首）
    ↓ engine.load / play / pause / seek
services/audio-engine.ts（时钟、总线、事件）
    ↓
SynthSource / MediaSource
```

- 引擎只认识"当前一首曲目"；"播完下一首播什么"是 player store 的策略（随机不重复、列表循环边界、单曲循环重播）。
- 组件（PlayerBar / Visualizer / LyricsPane…）不直接碰引擎，只读 store 与订阅频谱事件。

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { SHORTCUTS } from '../../composables/useGlobalShortcuts'
import { EQ_BANDS, EQ_PRESETS, gainToPct, pctToGain } from '../../services/audio-engine'
import * as ui from '../../stores/ui'
import type { AppVersions } from '@shared/ipc'

/**
 * 设置页。快捷键表直接读 SHORTCUTS，与处理器同源，加键位不会再漏改这一页。
 *
 * 设计稿把全部卡片平铺在一页里，顶部那排 Tab 因此是「跳到对应卡片」的分区导航，
 * 而不是内容切换 —— 页面上没有隐藏内容，也就不必用滚动监听去反推当前分区
 * （两列网格里同一屏常常压着两个分区，反推本来就有歧义）。
 *
 * 设计稿的「播放」卡片（启动时恢复、自动播放下一首、音量记忆、播完当前歌曲）没有对应
 * 实现或实现是空的，按「没有的就不做」整张省略；卡片顺序按高度两两配对，让均衡器与
 * 快捷键这两张高卡片同排，避免矮卡片旁边留下大片空白。
 */

const versions = ref<AppVersions | null>(null)
const stateDir = ref('')
const activeTab = ref('sleep')
/** 睡眠倒计时只活在本次会话（sleepEndsAt 不落盘），所以高亮状态也放在本地 */
const sleepMinutes = ref(0)

/** 顺序与卡片自上而下的顺序一致，id 与卡片上的 id 一一对应 */
const TABS = [
  { id: 'sleep', label: '睡眠', icon: 'clock' },
  { id: 'look', label: '界面', icon: 'sun' },
  { id: 'fx', label: '音效', icon: 'equalizer' },
  { id: 'keys', label: '快捷键', icon: 'keyboard' },
  { id: 'lyrics', label: '歌词', icon: 'lyrics' },
  { id: 'about', label: '关于', icon: 'info' }
] as const

const presetNames = Object.keys(EQ_PRESETS)

const sleepText = computed(() => {
  const endsAt = ui.sleepEndsAt.value
  // 只报「几点停」而不是「还剩几分钟」：没有秒级 tick，倒计时的数字会一直停在设定的那一刻
  if (endsAt <= 0) return '未开启，音乐会一直播放'
  const stop = new Date(endsAt)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `将在 ${pad(stop.getHours())}:${pad(stop.getMinutes())} 自动停止播放`
})

const jumpTo = (id: string): void => {
  activeTab.value = id
  document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const onSleep = (minutes: number): void => {
  sleepMinutes.value = minutes
  ui.setSleepTimer(minutes)
}

const onToggleEq = (): void => {
  ui.toggleEq()
  ui.persistEq()
}

const onPreset = (preset: string): void => {
  ui.setEqPreset(preset)
  ui.persistEq()
}

const onBandInput = (band: number, event: Event): void => {
  ui.setEqGain(band, pctToGain(Number((event.target as HTMLInputElement).value)))
}

// 倒计时结束后 sleepEndsAt 归零，高亮自动退回「关闭」
watch(
  () => ui.sleepEndsAt.value,
  (endsAt) => {
    if (endsAt <= 0) sleepMinutes.value = 0
  }
)

onMounted(async () => {
  versions.value = await window.shengyu.versions()
  stateDir.value = await window.shengyu.statePath()
  ui.persistEq()
})
</script>

<template>
  <section class="page-view">
    <header class="page-head">
      <h1>设置</h1>
      <p>自定义你的音乐体验，让声屿音乐更懂你。</p>
    </header>

    <nav class="tabs" aria-label="设置分区">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="tab"
        :class="{ active: activeTab === tab.id }"
        :aria-current="activeTab === tab.id ? 'true' : undefined"
        @click="jumpTo(tab.id)"
      >
        <AppIcon :name="tab.icon" :size="15" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <div class="grid">
      <!-- 睡眠定时 -->
      <section id="settings-sleep" class="card">
        <h2 class="card-head">
          <span class="card-icon"><AppIcon name="clock" :size="16" /></span>睡眠定时
        </h2>
        <p class="card-desc">设定时间后，音乐将自动停止播放</p>
        <div class="chips">
          <button
            v-for="minutes in [15, 30, 60, 90]"
            :key="minutes"
            :class="{ active: sleepMinutes === minutes }"
            @click="onSleep(minutes)"
          >
            {{ minutes }} 分钟
          </button>
          <button :class="{ active: sleepMinutes === 0 }" @click="onSleep(0)">关闭</button>
        </div>
        <p class="hint">{{ sleepText }}</p>
      </section>

      <!-- 界面主题 -->
      <section id="settings-look" class="card">
        <h2 class="card-head">
          <span class="card-icon"><AppIcon name="sun" :size="16" /></span>界面主题
        </h2>
        <p class="card-desc">晨雾与深海两套配色，切换即时生效</p>
        <div class="segmented" role="group" aria-label="界面主题">
          <button :class="{ active: ui.theme.value === 'light' }" @click="ui.setTheme('light')">
            <AppIcon name="sun" :size="15" />亮色
          </button>
          <button :class="{ active: ui.theme.value === 'dark' }" @click="ui.setTheme('dark')">
            <AppIcon name="moon" :size="15" />深色
          </button>
        </div>
      </section>

      <!-- 均衡器与音效 -->
      <section id="settings-fx" class="card">
        <h2 class="card-head">
          <span class="card-icon"><AppIcon name="equalizer" :size="16" /></span>均衡器与音效
        </h2>
        <label class="switch-row">
          <span class="switch-copy">
            <strong>启用均衡器</strong>
            <small>自定义音效，打造专属听感</small>
          </span>
          <input
            class="switch"
            type="checkbox"
            :checked="ui.eqEnabled.value"
            @change="onToggleEq"
          />
        </label>

        <div class="bands" :class="{ disabled: !ui.eqEnabled.value }">
          <div class="axis" aria-hidden="true">
            <span>+12dB</span><span>0dB</span><span>-12dB</span>
          </div>
          <div v-for="(band, index) in EQ_BANDS" :key="band.freq" class="band">
            <div class="slider-wrap">
              <input
                class="band-range"
                type="range"
                min="0"
                max="100"
                step="1"
                :value="gainToPct(ui.eqGains.value[index])"
                :disabled="!ui.eqEnabled.value"
                :aria-label="`${band.label} 增益`"
                @input="onBandInput(index, $event)"
                @change="ui.persistEq()"
              />
            </div>
            <span class="band-freq">{{ band.label }}</span>
          </div>
        </div>

        <p class="block-head">预设音效</p>
        <div class="chips">
          <button
            v-for="name in presetNames"
            :key="name"
            :class="{ active: ui.eqPreset.value === name }"
            @click="onPreset(name)"
          >
            {{ ui.EQ_PRESET_LABELS[name] }}
          </button>
        </div>

        <p class="block-head">增强效果</p>
        <div class="chips">
          <button
            v-for="(label, key) in ui.FX_LABELS"
            :key="key"
            :class="{ active: ui.fxPreset.value === key }"
            @click="ui.setFxPreset(key)"
          >
            {{ label }}
          </button>
        </div>

        <p class="hint">电台是直连播放，不受均衡器与音效影响 —— 这是已知设计，不是故障。</p>
      </section>

      <!-- 快捷键 -->
      <section id="settings-keys" class="card">
        <h2 class="card-head">
          <span class="card-icon"><AppIcon name="keyboard" :size="16" /></span>快捷键
        </h2>
        <p class="card-desc">在任意页面按下即可生效</p>
        <ul class="shortcuts">
          <li v-for="item in SHORTCUTS" :key="item.keys">
            <kbd>{{ item.keys }}</kbd>
            <span>{{ item.action }}</span>
          </li>
        </ul>
      </section>

      <!-- 歌词 -->
      <section id="settings-lyrics" class="card">
        <h2 class="card-head">
          <span class="card-icon"><AppIcon name="lyrics" :size="16" /></span>歌词
        </h2>
        <p class="card-desc">歌词颜色会同步到桌面歌词窗</p>
        <div class="swatches" role="group" aria-label="歌词颜色">
          <button
            v-for="color in ui.LYRICS_COLOR_PRESETS"
            :key="color"
            class="swatch"
            :class="{ active: ui.lyricsColor.value === color }"
            :style="{ background: color }"
            :aria-current="ui.lyricsColor.value === color ? 'true' : undefined"
            :aria-label="`歌词颜色 ${color}`"
            @click="ui.setLyricsColor(color)"
          ></button>
        </div>
      </section>

      <!-- 关于 -->
      <section id="settings-about" class="card">
        <h2 class="card-head">
          <span class="card-icon"><AppIcon name="info" :size="16" /></span>关于
        </h2>
        <ul class="about">
          <li>
            <span>应用版本</span><strong>{{ versions?.app ?? '—' }}</strong>
          </li>
          <li>
            <span>Electron</span><strong>{{ versions?.electron ?? '—' }}</strong>
          </li>
          <li>
            <span>Chromium</span><strong>{{ versions?.chrome ?? '—' }}</strong>
          </li>
          <li>
            <span>Node</span><strong>{{ versions?.node ?? '—' }}</strong>
          </li>
          <li class="path">
            <span>状态文件</span><strong :title="stateDir">{{ stateDir || '—' }}</strong>
          </li>
        </ul>
        <p class="hint">
          在线音乐来自 Audius 公开接口，电台来自 SomaFM；本地文件不会上传到任何地方。
        </p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.page-head {
  margin-bottom: 22px;
}
.page-head h1 {
  color: var(--text-1);
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.page-head p {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 15px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}
.tab {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  color: var(--text-2);
  background: var(--surface);
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease,
    border-color var(--dur-1) ease;
}
.tab:hover {
  color: var(--text-1);
}
.tab.active {
  color: var(--on-brand);
  border-color: var(--brand);
  background: var(--brand);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
}
.card {
  min-width: 0;
  padding: 20px 22px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  /* 顶部 Tab 跳转时留一点余量，卡片不至于紧贴滚动容器顶边 */
  scroll-margin-top: 12px;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
  font-size: 16px;
  font-weight: 600;
}
.card-icon {
  display: inline-flex;
  color: var(--brand);
}
.card-desc {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 12px;
}
.block-head {
  margin-top: 18px;
  color: var(--text-1);
  font-size: 13px;
  font-weight: 500;
}
.hint {
  margin-top: 12px;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.6;
}

.switch-row {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  cursor: pointer;
}
.switch-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.switch-copy strong {
  color: var(--text-1);
  font-size: 14px;
  font-weight: 500;
}
.switch-copy small {
  margin-top: 2px;
  color: var(--text-2);
  font-size: 12px;
}
/* 开关轨道直接画在 checkbox 上，滑块用伪元素，免得再包一层 DOM */
.switch {
  position: relative;
  flex: 0 0 auto;
  width: 38px;
  height: 22px;
  margin: 0;
  padding: 0;
  appearance: none;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--surface-soft-hover);
  cursor: pointer;
  transition: background var(--dur-2) var(--ease);
}
.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-2);
  transition:
    transform var(--dur-2) var(--ease),
    background var(--dur-2) var(--ease);
}
.switch:checked {
  background: var(--brand);
}
.switch:checked::after {
  background: var(--on-brand);
  transform: translateX(16px);
}

.segmented {
  display: inline-flex;
  gap: 2px;
  margin-top: 14px;
  padding: 3px;
  border-radius: var(--r-pill);
  background: var(--surface-soft);
}
.segmented button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border-radius: var(--r-pill);
  color: var(--text-2);
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.segmented button:hover {
  color: var(--text-1);
}
.segmented button.active {
  color: var(--text-1);
  background: var(--surface);
  box-shadow: var(--shadow-1);
  font-weight: 500;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.chips button {
  height: 30px;
  padding: 0 13px;
  border: 1px solid var(--divider);
  border-radius: var(--r-pill);
  color: var(--text-2);
  background: var(--surface);
  font-size: 13px;
  transition:
    color var(--dur-1) ease,
    border-color var(--dur-1) ease,
    background var(--dur-1) ease;
}
.chips button:hover {
  color: var(--text-1);
}
.chips button.active {
  color: var(--on-brand);
  border-color: var(--brand);
  background: var(--brand);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}
.swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--divider);
  cursor: pointer;
}
/* 选中环用卡片底色描出 2px 间隙，白色色块在亮色主题下也能看出选中 */
.swatch.active {
  box-shadow:
    0 0 0 2px var(--surface),
    0 0 0 4px var(--text-2);
}

.bands {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  margin-top: 16px;
  padding: 0 2px;
  transition: opacity var(--dur-2) ease;
}
.bands.disabled {
  opacity: 0.4;
}
.axis {
  display: flex;
  height: 132px;
  flex-direction: column;
  justify-content: space-between;
  margin-bottom: 22px;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 9px;
  text-align: right;
}
.band {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 8px;
}
/* 竖滑杆：外壳是 22×132 的竖槽，滑杆横放后整体旋转 90°，
   布局盒永远不越出列宽，杜绝溢出（v1.3.6 起不再用 writing-mode 方案） */
.slider-wrap {
  display: flex;
  width: 22px;
  height: 132px;
  align-items: center;
  justify-content: center;
}
.band-range {
  width: 132px;
  height: 22px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
  transform: rotate(-90deg);
}
.band-range:disabled {
  cursor: default;
}
.band-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 4px;
  background: var(--surface-soft-hover);
}
.band-range::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -5px;
  appearance: none;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: var(--brand);
}
.band-freq {
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 10px;
}

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
  list-style: none;
}
.shortcuts li {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-2);
  font-size: 13px;
}
.shortcuts kbd {
  flex: 0 0 auto;
  min-width: 76px;
  padding: 3px 9px;
  border: 1px solid var(--divider);
  border-radius: var(--r-sm);
  color: var(--text-1);
  background: var(--surface-soft);
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: center;
}

.about {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
  list-style: none;
}
.about li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-2);
  font-size: 13px;
}
.about li strong {
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
}
/* 状态文件是一整条绝对路径，横排会把卡片撑破，改成上下两行并省略中段 */
.about li.path {
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;
}
.about li.path strong {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

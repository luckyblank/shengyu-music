<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import {
  EQ_BANDS,
  EQ_PRESETS,
  FX_PRESET_LABELS,
  gainToPct,
  pctToGain,
  type FxPreset
} from '../services/audio-engine'
import * as ui from '../stores/ui'

const emit = defineEmits<{ close: [] }>()

const presets = Object.keys(EQ_PRESETS)
const fxPresets = Object.keys(FX_PRESET_LABELS) as FxPreset[]

const onBandInput = (band: number, event: Event): void => {
  const value = Number((event.target as HTMLInputElement).value)
  ui.setEqGain(band, pctToGain(value))
}

const onToggleEq = (): void => {
  ui.toggleEq()
  ui.persistEq()
}

const onPreset = (preset: string): void => {
  ui.setEqPreset(preset)
  ui.persistEq()
}

const onBandCommit = (): void => {
  ui.persistEq()
}
</script>

<template>
  <div class="eq-panel">
    <div class="eq-header">
      <div>
        <span class="section-kicker">声音整形</span>
        <h3>均衡器</h3>
      </div>
      <button class="icon-button" aria-label="关闭均衡器" @click="emit('close')">
        <AppIcon name="close" :size="17" />
      </button>
    </div>

    <label class="eq-switch">
      <span>启用均衡器</span>
      <input type="checkbox" :checked="ui.eqEnabled.value" @change="onToggleEq" /><i
        class="switch-track"
        ><i></i
      ></i>
    </label>

    <div class="eq-presets">
      <button
        v-for="preset in presets"
        :key="preset"
        :class="{ active: ui.eqPreset.value === preset }"
        @click="onPreset(preset)"
      >
        {{ ui.EQ_PRESET_LABELS[preset] }}
      </button>
    </div>

    <div class="eq-bands" :class="{ disabled: !ui.eqEnabled.value }">
      <div v-for="(band, index) in EQ_BANDS" :key="band.freq" class="eq-band">
        <span class="eq-gain"
          >{{ ui.eqGains.value[index] > 0 ? '+' : '' }}{{ ui.eqGains.value[index]
          }}<small>dB</small></span
        >
        <div class="eq-slider-wrap">
          <input
            type="range"
            class="eq-range"
            min="0"
            max="100"
            step="1"
            :value="gainToPct(ui.eqGains.value[index])"
            :disabled="!ui.eqEnabled.value"
            :aria-label="`${band.label} 增益`"
            @input="onBandInput(index, $event)"
            @change="onBandCommit"
          />
        </div>
        <span class="eq-freq">{{ band.label }}</span>
      </div>
    </div>

    <div class="fx-section">
      <div class="fx-section-head">
        <span class="section-kicker">音效</span>
        <small>作用在均衡器之后，对所有来源生效</small>
      </div>
      <div class="eq-presets fx-presets">
        <button
          v-for="preset in fxPresets"
          :key="preset"
          :class="{ active: ui.fxPreset.value === preset }"
          @click="ui.setFxPreset(preset)"
        >
          {{ FX_PRESET_LABELS[preset] }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eq-panel {
  position: fixed;
  z-index: 40;
  right: 24px;
  bottom: 100px;
  width: 340px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: 0 -12px 60px rgba(0, 0, 0, 0.35);
  /* 规范：浮层用实底 + 弱阴影，不做玻璃拟态 */
  animation: eq-in 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes eq-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.eq-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.eq-header h3 {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.eq-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding: 12px;
  border-radius: 12px;
  background: var(--wash-1);
  font-size: 12px;
  cursor: pointer;
}
.eq-switch input {
  display: none;
}
.switch-track {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--control);
  transition: background 180ms ease;
}
.switch-track i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-soft);
  transition:
    transform 180ms ease,
    background 180ms ease;
}
.eq-switch input:checked + .switch-track {
  background: var(--accent);
}
.eq-switch input:checked + .switch-track i {
  background: #fffaf4;
  transform: translateX(14px);
}
.eq-presets {
  display: flex;
  gap: 5px;
  margin: 14px 0 20px;
  flex-wrap: wrap;
}
.eq-presets button {
  height: 26px;
  padding: 0 11px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  color: var(--text-muted);
  background: transparent;
  font-size: 10px;
  transition:
    color 150ms ease,
    border-color 150ms ease,
    background 150ms ease;
}
.eq-presets button:hover {
  color: var(--paper-200);
}
.eq-presets button.active {
  color: var(--accent);
  border-color: rgba(239, 107, 79, 0.45);
  background: var(--accent-muted);
}
.eq-bands {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  transition: opacity 200ms ease;
}
.eq-bands.disabled {
  opacity: 0.35;
}
.eq-band {
  display: flex;
  width: 52px;
  height: 196px;
  min-width: 0;
  align-items: center;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
}
.eq-gain {
  color: var(--text-soft);
  font-family: var(--font-mono);
  font-size: 9px;
}
.eq-gain small {
  color: var(--text-faint);
}
/* 竖滑杆：外壳是 22×150 的竖槽，滑杆本身横放再整体旋转 90°，
   布局盒永远不越出列宽，杜绝溢出 */
.eq-slider-wrap {
  display: flex;
  width: 22px;
  height: 150px;
  align-items: center;
  justify-content: center;
}
.eq-range {
  width: 150px;
  height: 22px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
  transform: rotate(-90deg);
}
.eq-range:disabled {
  cursor: default;
}
.eq-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(
    to right,
    var(--control) 0 50%,
    color-mix(in srgb, var(--accent) 55%, transparent) 50%
  );
}
.eq-range::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  margin-top: -4px;
  appearance: none;
  border: 2px solid var(--paper-100);
  border-radius: 50%;
  background: var(--accent);
}
.eq-freq {
  margin-top: 10px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.04em;
}
.fx-section {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--hairline);
}
.fx-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.fx-section-head small {
  color: var(--text-faint);
  font-size: 9px;
}
.fx-presets {
  margin: 0;
}
</style>

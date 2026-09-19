<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * 无边框窗口控制：最小化 / 最大化（切换还原）/ 关闭。
 * 主进程通过 IPC 推送最大化状态变化（双击标题栏等操作也能同步）。
 */

const maximized = ref(false)
let unsubscribe: (() => void) | undefined

onMounted(async () => {
  maximized.value = await window.shengyu.isMaximized()
  unsubscribe = window.shengyu.onMaximizedChanged((value) => {
    maximized.value = value
  })
})
onBeforeUnmount(() => unsubscribe?.())

const minimize = (): void => {
  void window.shengyu.minimize()
}
const toggleMaximize = (): void => {
  void window.shengyu.toggleMaximize()
}
const close = (): void => {
  void window.shengyu.close()
}
</script>

<template>
  <div class="window-controls">
    <button class="window-control" aria-label="最小化" @click="minimize">
      <AppIcon name="minimize" :size="15" />
    </button>
    <button
      class="window-control"
      :aria-label="maximized ? '还原' : '最大化'"
      @click="toggleMaximize"
    >
      <AppIcon :name="maximized ? 'restore' : 'maximize'" :size="13" />
    </button>
    <button class="window-control close" aria-label="关闭" @click="close">
      <AppIcon name="close" :size="15" />
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;
}
.window-control {
  display: grid;
  width: 36px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  color: #848a93;
  background: transparent;
  transition:
    color 140ms ease,
    background 140ms ease;
}
.window-control:hover {
  color: var(--paper-100);
  background: var(--wash-3);
}
.window-control.close:hover {
  color: #fff;
  background: #c2402f;
}
</style>

<script setup lang="ts">
import AppIcon from '../AppIcon.vue'

/** 拖放导入时的全窗口提示层。显示与否由 App.vue 的拖放计数控制。 */
defineProps<{ visible: boolean }>()
</script>

<template>
  <div v-if="visible" class="drop-overlay">
    <div class="drop-card">
      <AppIcon name="folder-open" :size="30" />
      <h2>松手即可导入</h2>
      <p>支持音频文件与文件夹，会递归扫描并读取内嵌封面与 .lrc 歌词</p>
    </div>
  </div>
</template>

<style scoped>
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--bg) 78%, transparent);
}
.drop-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 34px 46px;
  border: 1px dashed var(--brand);
  border-radius: var(--r-xl);
  background: var(--surface);
  box-shadow: var(--shadow-2);
  text-align: center;
}
.drop-card .app-icon {
  color: var(--brand);
}
.drop-card h2 {
  color: var(--text-1);
  font-size: 18px;
  font-weight: 600;
}
.drop-card p {
  color: var(--text-2);
  font-size: 13px;
}
</style>

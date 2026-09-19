<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 全局确认对话框：window.ui.ask() 通过 'sy-ask' 事件触发，
 * 用于删除歌单这类需要确认的操作。
 */

interface AskDetail {
  title: string
  message: string
  resolve: (value: boolean) => void
}

const open = ref(false)
const title = ref('')
const message = ref('')
let resolver: ((value: boolean) => void) | null = null

const handle = (event: Event): void => {
  const detail = (event as CustomEvent<AskDetail>).detail
  title.value = detail.title
  message.value = detail.message
  resolver = detail.resolve
  open.value = true
}

const answer = (value: boolean): void => {
  open.value = false
  resolver?.(value)
  resolver = null
}

onMounted(() => window.addEventListener('sy-ask', handle))
onBeforeUnmount(() => window.removeEventListener('sy-ask', handle))
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="dialog-scrim" @click.self="answer(false)">
        <div class="dialog" role="dialog" :aria-label="title">
          <h3>{{ title }}</h3>
          <p>{{ message }}</p>
          <div class="dialog-actions">
            <button class="secondary-button" @click="answer(false)">取消</button>
            <button class="primary-button danger" @click="answer(true)">确认</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-scrim {
  position: fixed;
  z-index: 90;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(8, 9, 11, 0.55);
  backdrop-filter: blur(6px);
}
.dialog {
  width: min(400px, calc(100vw - 48px));
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface-solid);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);
}
.dialog h3 {
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.dialog p {
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.7;
}
.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 24px;
}
.primary-button.danger {
  background: #c2402f;
  box-shadow: 0 10px 24px rgba(194, 64, 47, 0.24);
}
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 200ms ease;
}
.dialog-enter-active .dialog,
.dialog-leave-active .dialog {
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .dialog,
.dialog-leave-to .dialog {
  transform: translateY(14px) scale(0.97);
}
</style>

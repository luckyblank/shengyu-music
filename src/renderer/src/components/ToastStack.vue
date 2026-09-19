<script setup lang="ts">
import { toasts, dismissToast } from '../stores/ui'
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="item in toasts"
          :key="item.id"
          class="toast"
          :class="`toast-${item.kind}`"
          @click="dismissToast(item.id)"
        >
          <span class="toast-dot"></span>
          <p>{{ item.message }}</p>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  z-index: 80;
  bottom: 104px;
  left: 50%;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  transform: translateX(-50%);
}
.toast {
  display: flex;
  gap: 10px;
  align-items: center;
  max-width: 420px;
  padding: 11px 18px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.4);
  /* 规范：不用玻璃拟态，Toast 用实底 + 弱阴影 */
  pointer-events: auto;
  cursor: pointer;
}
.toast-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--text-muted);
}
.toast-success .toast-dot {
  background: var(--success);
  box-shadow: 0 0 8px rgba(163, 181, 110, 0.6);
}
.toast-warning .toast-dot {
  background: #d5aa72;
}
.toast-error .toast-dot {
  background: var(--accent);
  box-shadow: 0 0 8px rgba(239, 107, 79, 0.6);
}
.toast p {
  color: var(--paper-200);
  font-size: 12px;
  line-height: 1.5;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 240ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.97);
}
</style>

<template>
  <div v-if="minimized.length" class="taskbar">
      <button
        v-for="win in minimized"
        :key="win.id"
        class="taskbar-item"
        :title="win.title"
        @click="manager.minimize(win.id)"
      >
        <v-icon size="14" class="taskbar-icon">{{ win.icon || 'mdi-window-maximize' }}</v-icon>
        <span class="taskbar-title">{{ win.title }}</span>
        <v-icon size="12" class="taskbar-close" @click.stop="manager.close(win.id)">mdi-close</v-icon>
      </button>
    </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  manager: { type: Object, required: true },
})

const minimized = computed(() => props.manager.windows.filter(w => w.minimized))
</script>

<style scoped>
.taskbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: rgba(var(--v-theme-surface), 0.92);
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  backdrop-filter: blur(8px);
  z-index: 3000;
  overflow-x: auto;
  overflow-y: hidden;
}
.taskbar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 8px;
  height: 26px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  background: rgba(var(--v-theme-surface-variant), 0.5);
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 12px;
  transition: background 0.1s;
}
.taskbar-item:hover {
  background: rgba(var(--v-theme-surface-variant), 0.9);
}
.taskbar-title {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.taskbar-close {
  opacity: 0.5;
  border-radius: 3px;
  padding: 1px;
}
.taskbar-close:hover {
  opacity: 1;
  background: rgba(var(--v-theme-error), 0.7);
  color: white;
}
</style>

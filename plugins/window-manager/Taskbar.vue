<template>
  <div v-if="minimized.length" class="taskbar">
    <v-chip
      v-for="win in minimized"
      :key="win.id"
      color="primary"
      variant="tonal"
      size="small"
      class="taskbar-chip"
      :title="win.title"
      @click="manager.minimize(win.id)"
    >
      <v-icon start size="14">{{ win.icon || 'mdi-window-maximize' }}</v-icon>
      <span class="taskbar-title">{{ win.title }}</span>
      <v-icon
        end size="12"
        class="taskbar-close"
        @click.stop="manager.close(win.id)"
      >
        mdi-close
      </v-icon>
    </v-chip>
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
  height: 40px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  background: rgba(var(--v-theme-surface), 0.92);
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  backdrop-filter: blur(8px);
  z-index: 3000;
  overflow-x: auto;
  overflow-y: hidden;
}

.taskbar-chip {
  flex-shrink: 0;
  max-width: 200px;
  cursor: pointer;
}

.taskbar-title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.taskbar-close {
  opacity: 0.6;
  border-radius: 50%;
  padding: 2px;
  transition: opacity 0.15s, background 0.15s;
}
.taskbar-close:hover {
  opacity: 1;
  background: rgba(var(--v-theme-error), 0.8);
  color: white;
}
</style>

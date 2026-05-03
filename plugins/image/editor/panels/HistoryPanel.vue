<script setup>
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

const { history, jumpTo } = inject('editorHistory')
const state = inject('editorState')
const { t } = useI18n()

function jump(index) { jumpTo(index, state) }
</script>

<template>
  <div class="history-panel">
    <div class="panel-header">
      <span class="panel-title">{{ t('editor.history') }}</span>
    </div>
    <div class="history-list">
      <div
        v-for="(step, i) in history.steps"
        :key="i"
        class="history-item"
        :class="{ current: i === history.currentIndex, future: i > history.currentIndex }"
        @click="jump(i)"
      >
        <v-icon size="14" class="mr-1">mdi-history</v-icon>
        {{ step.label }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-panel { display: flex; flex-direction: column; height: 100%; }
.panel-header { display: flex; align-items: center; padding: 4px 8px; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.panel-title { font-size: 11px; font-weight: 600; color: rgba(var(--v-theme-on-surface), 0.7); text-transform: uppercase; letter-spacing: 0.5px; }
.history-list { overflow-y: auto; flex: 1; }
.history-item {
  display: flex; align-items: center;
  padding: 4px 8px; font-size: 12px; cursor: pointer;
  border-bottom: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.3));
  transition: background 0.1s;
}
.history-item:hover { background: rgba(var(--v-theme-on-surface), 0.05); }
.history-item.current { background: rgba(var(--v-theme-primary), 0.15); font-weight: 500; }
.history-item.future { opacity: 0.4; }
</style>

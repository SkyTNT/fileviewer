<script setup>
import { ref, computed, watch, inject, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  win:         { type: Object,   default: null },
  winId:       { type: String,   default: null },
  winManager:  { type: Object,   default: null },
  onSaveState: { type: Function, default: null },
})

const taskStore = inject('services').get('task.state')
const { t }     = useI18n()
const collapsed = ref(false)

const { startDrag, startDragTouch } = inject('winDrag', { startDrag: () => {}, startDragTouch: () => {} })

const running = computed(() => taskStore.tasks.filter(t => t.status === 'running').length)
const errored = computed(() => taskStore.tasks.filter(t => t.status === 'error').length)
const hasDone = computed(() => taskStore.tasks.some(t => t.status !== 'running'))

const headerLabel = computed(() => {
  if (running.value > 0) return t('tasks.runningN', running.value)
  if (errored.value > 0) return t('tasks.doneWithErrors', { n: errored.value })
  return t('tasks.allDone')
})

const COLLAPSED_H = 44
const MAX_H       = 600
const HEADER_H    = 44
const FOOTER_H    = 37  // clear-done row (divider + button row)

// Cap the task list so total content never exceeds MAX_H
const taskListMaxH = computed(() => {
  const footerH = hasDone.value ? FOOTER_H : 0
  return MAX_H - HEADER_H - 1 - footerH  // 1 = divider between header and list
})

const expandedH = ref(props.win?.h ?? 500)

function setWinH(h) {
  if (!props.winManager || !props.winId || !props.win) return
  const bottom = props.win.y + props.win.h
  props.winManager.setPosition(props.winId, { x: props.win.x, y: Math.max(0, bottom - h) })
  props.winManager.setSize(props.winId, { w: props.win.w, h })
}

// Persist to memory
watch([() => props.win?.x, () => props.win?.y, () => props.win?.w, expandedH], () => {
  if (!props.win || !props.onSaveState) return
  props.onSaveState({ x: props.win.x, y: props.win.y, w: props.win.w, h: expandedH.value })
})

function toggle() {
  collapsed.value = !collapsed.value
  if (collapsed.value) {
    expandedH.value = props.win?.h ?? expandedH.value
    setWinH(COLLAPSED_H)
  } else {
    setWinH(expandedH.value)
  }
}

const panelEl = ref(null)

async function updateHeight() {
  if (collapsed.value || !panelEl.value || !props.win) return
  await nextTick()
  const h = panelEl.value.offsetHeight
  if (h > 0 && Math.abs(h - props.win.h) > 1) {
    expandedH.value = h
    setWinH(h)
  }
}

// Expand/grow when tasks change
watch(() => taskStore.tasks.length, async (n, prev) => {
  if (n > prev && collapsed.value) {
    collapsed.value = false
  }
  await updateHeight()
})

// Footer appears/disappears → height changes
watch(hasDone, updateHeight)

onBeforeUnmount(() => {
  if (collapsed.value) setWinH(expandedH.value)
})
</script>

<template>
  <div ref="panelEl" class="task-panel-root">
    <!-- Header -->
    <div
      class="d-flex align-center px-3 py-2 task-header"
      @mousedown.prevent="startDrag"
      @touchstart.prevent="startDragTouch"
    >
      <v-progress-circular
        v-if="running > 0"
        :size="16" :width="2"
        indeterminate color="primary"
        class="mr-2 flex-shrink-0"
      />
      <v-icon v-else size="16" color="success" class="mr-2">mdi-check-circle-outline</v-icon>
      <span class="text-body-2 font-weight-medium">{{ headerLabel }}</span>
      <v-spacer />
      <v-btn
        icon size="x-small" variant="text"
        @click.stop="toggle"
        @mousedown.stop @touchstart.stop
      >
        <v-icon size="16">{{ collapsed ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </v-btn>
      <v-btn
        icon size="x-small" variant="text"
        :disabled="running > 0"
        @click.stop="taskStore.clearAll()"
        @mousedown.stop @touchstart.stop
      >
        <v-icon size="16">mdi-close</v-icon>
      </v-btn>
    </div>

    <!-- Task list -->
    <template v-if="!collapsed">
      <v-divider />
      <div class="task-list" :style="{ maxHeight: taskListMaxH + 'px' }">
        <template v-for="(task, i) in taskStore.tasks" :key="task.id">
          <v-divider v-if="i > 0" />
          <component :is="task.component" :task="task" />
        </template>
      </div>

      <template v-if="hasDone">
        <v-divider />
        <div class="px-2 py-1 text-right">
          <v-btn size="x-small" variant="text" color="medium-emphasis" @click="taskStore.clearDone()">
            {{ t('tasks.clearDone') }}
          </v-btn>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.task-panel-root {
  flex-shrink: 0;  /* don't compress — offsetHeight gives true natural height */
}
.task-header {
  cursor: move;
  user-select: none;
  min-height: 44px;
}
.task-list {
  overflow-y: auto;
}
</style>

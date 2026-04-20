<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const props     = defineProps({ task: Object })
const { t }     = useI18n()
const taskStore = inject('services').get('task.store')
const ft        = inject('services').get('file.types')

const d       = computed(() => props.task.data)
const scanning = computed(() => d.value.phase === 'scanning' && props.task.status === 'running')

const percent = computed(() => {
  if (d.value.bytes_total) return Math.round(d.value.bytes_done / d.value.bytes_total * 100)
  if (d.value.total)       return Math.round(d.value.done / d.value.total * 100)
  return 0
})
const color = computed(() => {
  if (props.task.status === 'error') return 'error'
  if (props.task.status === 'done')  return 'success'
  return 'primary'
})
</script>

<template>
  <div class="px-3 py-2">
    <div class="d-flex align-center ga-1 mb-1">
      <v-icon size="15" :color="color">mdi-archive-plus-outline</v-icon>
      <span class="text-body-2 text-truncate" style="flex: 1; min-width: 0" :title="d.outputName">
        {{ d.outputName }}
      </span>
      <span class="text-caption text-medium-emphasis">
        {{ scanning ? t('notify.scanning') : `${d.done} / ${d.total || '…'}` }}
      </span>
      <v-btn v-if="task.status === 'running' && task.cancel" icon size="x-small" variant="text"
             :title="'Cancel'" @click="task.cancel()">
        <v-icon size="13">mdi-stop</v-icon>
      </v-btn>
      <v-btn v-else-if="task.status !== 'running'" icon size="x-small" variant="text"
             @click="taskStore.remove(task.id)">
        <v-icon size="13">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-progress-linear
      :model-value="percent"
      :indeterminate="scanning || (!d.bytes_total && !d.total && task.status === 'running')"
      :color="color"
      height="4" rounded class="mb-1"
    />

    <div class="d-flex justify-space-between text-caption text-medium-emphasis">
      <span class="text-truncate" style="min-width: 0">
        <template v-if="scanning">{{ t('notify.scanCount', { n: d.scan_count }) }}</template>
        <template v-else-if="d.current" :title="d.current">{{ d.current }}</template>
      </span>
      <span v-if="d.bytes_total" class="flex-shrink-0 ml-2">
        {{ ft.formatBytes(d.bytes_done) }} / {{ ft.formatBytes(d.bytes_total) }}
      </span>
    </div>

    <div v-for="(err, i) in task.errors.slice(0, 3)" :key="i"
         class="text-caption mt-1"
         :class="err.startsWith('⚠') ? 'text-warning' : 'text-error'">
      {{ err }}
    </div>
  </div>
</template>

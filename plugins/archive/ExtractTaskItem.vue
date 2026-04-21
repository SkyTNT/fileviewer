<script setup>
import { computed, inject } from 'vue'

const props     = defineProps({ task: Object })
const services  = inject('services')
const taskStore = services.get('task.state')
const ft        = services.get('file.types')

const d       = computed(() => props.task.data)
const percent = computed(() =>
  d.value.bytes_total ? Math.round(d.value.bytes_done / d.value.bytes_total * 100)
  : d.value.total     ? Math.round(d.value.done / d.value.total * 100)
  : 0
)
const color = computed(() => {
  if (props.task.status === 'error') return 'error'
  if (props.task.status === 'done')  return 'success'
  return 'primary'
})
</script>

<template>
  <div class="px-3 py-2">
    <div class="d-flex align-center ga-1 mb-1">
      <v-icon size="15" :color="color">mdi-archive-arrow-down-outline</v-icon>
      <span class="text-body-2 text-truncate" style="flex: 1; min-width: 0" :title="d.fileName">
        {{ d.fileName }}
      </span>
      <span class="text-caption text-medium-emphasis">
        <template v-if="d.bytes_total">{{ ft.formatBytes(d.bytes_done) }} / {{ ft.formatBytes(d.bytes_total) }}</template>
        <template v-else>{{ d.done }} / {{ d.total || '…' }}</template>
      </span>
      <v-btn v-if="task.status === 'running' && task.cancel" icon size="x-small" variant="text"
             title="Cancel" @click="task.cancel()">
        <v-icon size="13">mdi-stop</v-icon>
      </v-btn>
      <v-btn v-else-if="task.status !== 'running'" icon size="x-small" variant="text"
             @click="taskStore.remove(task.id)">
        <v-icon size="13">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-progress-linear
      :model-value="percent"
      :indeterminate="!d.bytes_total && !d.total && task.status === 'running'"
      :color="color"
      height="4" rounded class="mb-1"
    />

    <div v-if="d.current" class="text-caption text-medium-emphasis text-truncate" :title="d.current">
      {{ d.current }}
    </div>

    <div v-for="(err, i) in task.errors.slice(0, 3)" :key="i" class="text-caption text-error mt-1">
      {{ err }}
    </div>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const props     = defineProps({ task: Object })
const { t }     = useI18n()
const taskStore = inject('services').get('task.state')
const ft        = inject('services').get('file.types')

const d       = computed(() => props.task.data)
const percent = computed(() =>
  d.value.bytes_total ? Math.round(d.value.bytes_done / d.value.bytes_total * 100) : 0
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
      <v-icon size="15" :color="color">
        {{ d.action === 'move' ? 'mdi-content-cut' : d.action === 'link' ? 'mdi-link-variant' : 'mdi-content-copy' }}
      </v-icon>
      <span class="text-body-2 font-weight-medium" style="flex: 1">
        {{ d.action === 'move' ? t('notify.movingFiles') : d.action === 'link' ? t('notify.creatingLinks') : t('notify.copyingFiles') }}
      </span>
      <span class="text-caption text-medium-emphasis">{{ d.done }} / {{ d.total }}</span>
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
      :indeterminate="!d.bytes_total && task.status === 'running'"
      :color="color"
      height="4" rounded class="mb-1"
    />

    <div class="d-flex justify-space-between text-caption text-medium-emphasis">
      <span v-if="d.current" class="text-truncate" style="min-width: 0" :title="d.current">{{ d.current }}</span>
      <span v-if="d.bytes_total" class="flex-shrink-0 ml-2">
        {{ ft.formatBytes(d.bytes_done) }} / {{ ft.formatBytes(d.bytes_total) }}
      </span>
    </div>

    <div v-for="(err, i) in task.errors.slice(0, 3)" :key="i" class="text-caption text-error mt-1">
      {{ err }}
    </div>
  </div>
</template>

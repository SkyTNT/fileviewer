<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/plugins/task/store.js'

const props     = defineProps({ task: Object })
const { t }     = useI18n()
const taskStore = useTaskStore()

const d       = computed(() => props.task.data)
const percent = computed(() =>
  d.value.total ? Math.round(d.value.done / d.value.total * 100) : 0
)
const color = computed(() => {
  if (props.task.status === 'done') return 'success'
  return 'error'
})
</script>

<template>
  <div class="px-3 py-2">
    <div class="d-flex align-center ga-1 mb-1">
      <v-icon size="15" :color="color">mdi-delete-outline</v-icon>
      <span class="text-body-2 font-weight-medium" style="flex: 1">{{ t('notify.deletingFiles') }}</span>
      <span class="text-caption text-medium-emphasis">{{ d.done }} / {{ d.total }}</span>
      <v-btn v-if="task.status !== 'running'" icon size="x-small" variant="text"
             @click="taskStore.remove(task.id)">
        <v-icon size="13">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-progress-linear :model-value="percent" :color="color" height="4" rounded class="mb-1" />

    <div v-if="d.current" class="text-caption text-medium-emphasis text-truncate" :title="d.current">
      {{ d.current }}
    </div>

    <div v-for="(err, i) in task.errors.slice(0, 3)" :key="i" class="text-caption text-error mt-1">
      {{ err }}
    </div>
  </div>
</template>

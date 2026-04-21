<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const props     = defineProps({ task: Object })
const { t }     = useI18n()
const taskStore = inject('services').get('task.state')

const files     = computed(() => props.task.data.files)
const uploading = computed(() => files.value.filter(f => f.status === 'uploading').length)
const errored   = computed(() => files.value.filter(f => f.status === 'error').length)

const headerLabel = computed(() => {
  if (uploading.value > 0) return t('upload.uploadingN', uploading.value)
  if (errored.value   > 0) return t('upload.doneWithErrors', { n: errored.value })
  return t('upload.allDone', { n: files.value.length })
})

function fileIcon(f) {
  if (f.status === 'done')  return 'mdi-check-circle-outline'
  if (f.status === 'error') return 'mdi-alert-circle-outline'
  return 'mdi-file-upload-outline'
}
function fileColor(f) {
  if (f.status === 'done')  return 'success'
  if (f.status === 'error') return 'error'
  return 'primary'
}
</script>

<template>
  <div class="px-3 py-2">
    <!-- Batch header -->
    <div class="d-flex align-center ga-1 mb-1">
      <v-icon size="15" color="primary">mdi-cloud-upload-outline</v-icon>
      <span class="text-body-2 font-weight-medium" style="flex: 1">{{ headerLabel }}</span>
      <v-btn v-if="task.status !== 'running'" icon size="x-small" variant="text"
             @click="taskStore.remove(task.id)">
        <v-icon size="13">mdi-close</v-icon>
      </v-btn>
    </div>

    <!-- Per-file rows -->
    <div v-for="file in files" :key="file.id" class="mb-1">
      <div class="d-flex align-center ga-1">
        <v-tooltip v-if="file.status === 'error'" :text="file.error" location="bottom">
          <template #activator="{ props: p }">
            <v-icon v-bind="p" size="13" :color="fileColor(file)">{{ fileIcon(file) }}</v-icon>
          </template>
        </v-tooltip>
        <v-icon v-else size="13" :color="fileColor(file)">{{ fileIcon(file) }}</v-icon>

        <span class="text-caption text-truncate" style="flex: 1; min-width: 0" :title="file.name">
          {{ file.name }}
        </span>
        <span v-if="file.status === 'uploading'" class="text-caption text-medium-emphasis">
          <span v-if="file.resumeOffset" style="opacity: .6">↑</span>{{ file.progress }}%
        </span>
        <v-btn icon size="x-small" variant="text" @click="task.data.removeFile(file.id)">
          <v-icon size="11">mdi-close</v-icon>
        </v-btn>
      </div>

      <v-progress-linear
        v-show="file.status === 'uploading'"
        :model-value="file.progress"
        color="primary" height="2" rounded
      />
    </div>
  </div>
</template>

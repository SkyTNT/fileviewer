<script setup>
import { ref, computed, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useUploadStore } from './store.js'

const uploadStore = useUploadStore()
const { mobile }  = useDisplay()
const { t }       = useI18n()
const collapsed   = ref(false)

const uploading = computed(() => uploadStore.uploadTasks.filter(t => t.status === 'uploading').length)
const done      = computed(() => uploadStore.uploadTasks.filter(t => t.status === 'done').length)
const errors    = computed(() => uploadStore.uploadTasks.filter(t => t.status === 'error').length)
const hasDone   = computed(() => done.value + errors.value > 0)

const headerLabel = computed(() => {
  if (uploading.value > 0) return t('upload.uploadingN', uploading.value)
  if (errors.value  > 0) return t('upload.doneWithErrors', { n: errors.value })
  return t('upload.allDone', { n: done.value })
})

watch(() => uploadStore.uploadTasks.length, (n, prev) => { if (n > prev) collapsed.value = false })

function statusIcon(task) {
  if (task.status === 'done')  return 'mdi-check-circle-outline'
  if (task.status === 'error') return 'mdi-alert-circle-outline'
  return 'mdi-file-upload-outline'
}
function statusColor(task) {
  if (task.status === 'done')  return 'success'
  if (task.status === 'error') return 'error'
  return 'primary'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="uploadStore.uploadTasks.length" class="upload-panel" :class="{ 'upload-panel--mobile': mobile }">
      <v-card elevation="8" rounded="lg" :width="mobile ? undefined : 320">

        <!-- Header -->
        <div class="d-flex align-center px-3 py-2" style="cursor:pointer; min-height:44px" @click="collapsed = !collapsed">
          <v-icon size="18" color="primary" class="mr-2">mdi-cloud-upload-outline</v-icon>
          <span class="text-body-2 font-weight-medium">{{ headerLabel }}</span>
          <v-spacer />
          <v-btn icon size="x-small" variant="text" @click.stop="collapsed = !collapsed">
            <v-icon size="16">{{ collapsed ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
          </v-btn>
          <v-btn icon size="x-small" variant="text" :disabled="uploading > 0" @click.stop="uploadStore.clearAllUploads">
            <v-icon size="16">mdi-close</v-icon>
          </v-btn>
        </div>

        <!-- Task list -->
        <template v-if="!collapsed">
          <v-divider />
          <div class="task-list">
            <div
              v-for="task in uploadStore.uploadTasks"
              :key="task.id"
              class="px-3 py-2"
            >
              <div class="d-flex align-center ga-1 mb-1">
                <v-tooltip v-if="task.status === 'error'" :text="task.error" location="bottom">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="15" :color="statusColor(task)">{{ statusIcon(task) }}</v-icon>
                  </template>
                </v-tooltip>
                <v-icon v-else size="15" :color="statusColor(task)">{{ statusIcon(task) }}</v-icon>
                <span class="text-body-2 text-truncate" style="flex:1; min-width:0" :title="task.name">{{ task.name }}</span>
                <div style="flex-shrink:0" class="d-flex align-center ga-1">
                  <span v-if="task.status === 'uploading'" class="text-caption text-medium-emphasis">
                    {{ task.progress }}%
                  </span>
                  <v-btn icon size="x-small" variant="text" @click="uploadStore.removeUploadTask(task.id)">
                    <v-icon size="13">mdi-close</v-icon>
                  </v-btn>
                </div>
              </div>

              <v-progress-linear
                v-show="task.status === 'uploading'"
                :model-value="task.progress"
                color="primary"
                height="2"
                rounded
              />
            </div>
          </div>

          <template v-if="hasDone">
            <v-divider />
            <div class="px-2 py-1 text-right">
              <v-btn size="x-small" variant="text" color="medium-emphasis" @click="uploadStore.clearUploadsDone">
                {{ t('upload.clearDone') }}
              </v-btn>
            </div>
          </template>
        </template>

      </v-card>
    </div>
  </Teleport>
</template>

<style scoped>
.upload-panel {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2000;
}
.upload-panel--mobile {
  left: 8px;
  right: 8px;
  bottom: 8px;
}
.task-list {
  max-height: 300px;
  overflow-y: auto;
}
</style>

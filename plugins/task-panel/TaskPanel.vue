<script setup>
import { ref, computed, watch, inject } from 'vue'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const taskStore = inject('services').get('task.store')
const { mobile } = useDisplay()
const { t }      = useI18n()
const collapsed  = ref(false)

const running  = computed(() => taskStore.tasks.filter(t => t.status === 'running').length)
const errored  = computed(() => taskStore.tasks.filter(t => t.status === 'error').length)
const hasDone  = computed(() => taskStore.tasks.some(t => t.status !== 'running'))

const headerLabel = computed(() => {
  if (running.value > 0) return t('tasks.runningN', running.value)
  if (errored.value > 0) return t('tasks.doneWithErrors', { n: errored.value })
  return t('tasks.allDone')
})

// Auto-expand when a new task is added
watch(() => taskStore.tasks.length, (n, prev) => { if (n > prev) collapsed.value = false })
</script>

<template>
  <Teleport to="body">
    <div v-if="taskStore.tasks.length" class="task-panel" :class="{ 'task-panel--mobile': mobile }">
      <v-card elevation="8" rounded="lg" :width="mobile ? undefined : 340">

        <!-- Header -->
        <div
          class="d-flex align-center px-3 py-2"
          style="cursor: pointer; min-height: 44px"
          @click="collapsed = !collapsed"
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
          <v-btn icon size="x-small" variant="text" @click.stop="collapsed = !collapsed">
            <v-icon size="16">{{ collapsed ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
          </v-btn>
          <v-btn icon size="x-small" variant="text" :disabled="running > 0" @click.stop="taskStore.clearAll()">
            <v-icon size="16">mdi-close</v-icon>
          </v-btn>
        </div>

        <!-- Task list -->
        <template v-if="!collapsed">
          <v-divider />
          <div class="task-list">
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

      </v-card>
    </div>
  </Teleport>
</template>

<style scoped>
.task-panel {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2000;
}
.task-panel--mobile {
  left: 8px;
  right: 8px;
  bottom: 8px;
}
.task-list {
  max-height: 450px;
  overflow-y: auto;
}
</style>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArchiveStore } from '@/plugins/archive/store.js'

const { t } = useI18n()
const archiveStore = useArchiveStore()

const showPwd = ref(false)

const percent = computed(() =>
  archiveStore.extractProgress.total > 0
    ? Math.round((archiveStore.extractProgress.done / archiveStore.extractProgress.total) * 100)
    : 0
)
</script>

<template>
  <v-dialog :model-value="archiveStore.extractDialog" max-width="420" persistent>
    <v-card class="pa-4">
      <div class="d-flex align-center mb-3 ga-2">
        <v-icon color="primary">mdi-archive-arrow-down-outline</v-icon>
        <span class="text-subtitle-1 font-weight-medium">{{ t('archive.viewer.extracting') }}</span>
      </div>
      <div class="text-caption text-medium-emphasis mb-3 text-truncate" :title="archiveStore.extractProgress.file?.name">
        {{ archiveStore.extractProgress.file?.name }}
      </div>

      <!-- Password phase -->
      <template v-if="archiveStore.extractProgress.phase === 'password'">
        <div class="d-flex align-center ga-2 mb-3">
          <v-icon color="warning" size="18">mdi-lock-outline</v-icon>
          <span class="text-body-2">{{ t('archive.viewer.passwordPrompt') }}</span>
        </div>
        <v-text-field
          v-model="archiveStore.extractPassword"
          :type="showPwd ? 'text' : 'password'"
          :label="t('archive.viewer.password')"
          autocomplete="off"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-4"
          :append-inner-icon="showPwd ? 'mdi-eye-off' : 'mdi-eye'"
          @click:append-inner="showPwd = !showPwd"
          @keydown.enter="archiveStore.confirmExtract"
        />
        <v-card-actions class="px-0 pb-0 pt-0">
          <v-btn variant="text" @click="archiveStore.closeExtract">{{ t('dialog.cancel') }}</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-archive-arrow-down-outline" @click="archiveStore.confirmExtract">
            {{ t('archive.viewer.unlock') }}
          </v-btn>
        </v-card-actions>
      </template>

      <!-- Running / done phase -->
      <template v-else>
        <v-progress-linear
          :model-value="percent"
          :indeterminate="archiveStore.extractProgress.total === 0 && !archiveStore.extractProgress.finished"
          color="primary"
          height="8"
          rounded
          class="mb-2"
        />
        <div class="text-caption text-medium-emphasis mb-2">
          {{ archiveStore.extractProgress.done }} / {{ archiveStore.extractProgress.total || '…' }}
        </div>
        <div v-for="(err, i) in archiveStore.extractProgress.errors.slice(0, 5)" :key="i" class="text-caption text-error">
          {{ err }}
        </div>
        <v-card-actions v-if="archiveStore.extractProgress.finished" class="px-0 pb-0 pt-3">
          <v-spacer />
          <v-btn color="primary" variant="tonal" @click="archiveStore.closeExtract">
            {{ t('archive.viewer.close') }}
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>

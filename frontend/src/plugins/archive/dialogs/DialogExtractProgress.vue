<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArchiveStore } from '@/plugins/archive/store.js'

const { t }        = useI18n()
const archiveStore = useArchiveStore()
const showPwd      = ref(false)
</script>

<template>
  <v-dialog :model-value="archiveStore.extractDialog" max-width="420" persistent>
    <v-card class="pa-4">
      <div class="d-flex align-center mb-3 ga-2">
        <v-icon color="warning">mdi-lock-outline</v-icon>
        <span class="text-subtitle-1 font-weight-medium">{{ t('archive.viewer.passwordPrompt') }}</span>
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
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-archive-arrow-down-outline"
               @click="archiveStore.confirmExtract">
          {{ t('archive.viewer.unlock') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

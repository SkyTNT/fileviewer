<script setup>
import { useI18n } from 'vue-i18n'
import { useFileStore } from '../stores/fileStore.js'
import { useNotificationStore } from '../stores/notificationStore.js'

const store = useFileStore()
const notif = useNotificationStore()
const { t } = useI18n()
</script>

<template>
  <!-- Error / success toast -->
  <v-snackbar v-model="notif.visible" :color="notif.color" timeout="3000" location="bottom">
    <v-icon class="mr-2">{{ notif.color === 'error' ? 'mdi-alert-circle-outline' : 'mdi-check-circle-outline' }}</v-icon>
    {{ notif.msg }}
  </v-snackbar>

  <!-- Operation progress (delete / copy / move) -->
  <v-snackbar
    :model-value="!!(store.deleteProgress || store.pasteProgress)"
    :timeout="-1"
    location="bottom"
    color="surface"
    elevation="4"
    min-width="300"
  >
    <template v-if="store.deleteProgress">
      <div class="d-flex align-center ga-2 mb-1">
        <v-icon size="18" color="error">mdi-delete-outline</v-icon>
        <span class="text-body-2 font-weight-medium">{{ t('notify.deletingFiles') }}</span>
        <v-spacer />
        <span class="text-caption text-medium-emphasis">
          {{ store.deleteProgress.done }} / {{ store.deleteProgress.total }}
        </span>
      </div>
      <v-progress-linear
        :model-value="store.deleteProgress.total ? (store.deleteProgress.done / store.deleteProgress.total) * 100 : 0"
        color="error" rounded height="6"
      />
    </template>
    <template v-else-if="store.pasteProgress">
      <div class="d-flex align-center ga-2 mb-1">
        <v-icon size="18" color="primary">
          {{ store.pasteProgress.action === 'cut' ? 'mdi-content-cut' : 'mdi-content-copy' }}
        </v-icon>
        <span class="text-body-2 font-weight-medium">
          {{ store.pasteProgress.action === 'cut' ? t('notify.movingFiles') : t('notify.copyingFiles') }}
        </span>
        <v-spacer />
        <span class="text-caption text-medium-emphasis">
          {{ store.pasteProgress.done }} / {{ store.pasteProgress.total }}
        </span>
      </div>
      <v-progress-linear
        :model-value="store.pasteProgress.total ? (store.pasteProgress.done / store.pasteProgress.total) * 100 : 0"
        color="primary" rounded height="6"
      />
    </template>
  </v-snackbar>

</template>

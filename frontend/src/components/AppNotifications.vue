<script setup>
import { useFileStore } from '../stores/fileStore.js'
import { useNotification } from '../composables/useNotification.js'

const store = useFileStore()
const { notifMsg, notifColor, notifVisible } = useNotification()
</script>

<template>
  <!-- Error / success toast -->
  <v-snackbar v-model="notifVisible" :color="notifColor" timeout="3000" location="bottom">
    <v-icon class="mr-2">{{ notifColor === 'error' ? 'mdi-alert-circle-outline' : 'mdi-check-circle-outline' }}</v-icon>
    {{ notifMsg }}
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
        <span class="text-body-2 font-weight-medium">Deleting files</span>
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
          {{ store.pasteProgress.action === 'cut' ? 'Moving' : 'Copying' }} files
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

  <!-- Paste conflict dialog -->
  <v-dialog :model-value="!!store.pasteConflicts" max-width="480" persistent>
    <v-card>
      <v-card-title class="pa-4">Name conflict</v-card-title>
      <v-card-text class="pt-0">
        <p class="mb-3 text-body-2">
          {{ store.pasteConflicts?.conflicts.length }} item(s) already exist in the destination:
        </p>
        <v-list density="compact" class="rounded mb-3" max-height="160" style="overflow-y:auto">
          <v-list-item
            v-for="c in (store.pasteConflicts?.conflicts ?? []).slice(0, 100)"
            :key="c.src"
            :title="c.name"
            prepend-icon="mdi-file-outline"
          />
          <v-list-item
            v-if="(store.pasteConflicts?.conflicts.length ?? 0) > 100"
            :title="`… and ${store.pasteConflicts.conflicts.length - 100} more`"
          />
        </v-list>
        <p class="text-body-2">What would you like to do?</p>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0 flex-wrap ga-2">
        <v-btn variant="text" @click="store.pasteConflicts = null">Cancel</v-btn>
        <v-spacer />
        <v-btn variant="tonal" @click="store.resolvePaste('skip')">Skip</v-btn>
        <v-btn variant="tonal" color="warning" @click="store.resolvePaste('coexist')">Keep both</v-btn>
        <v-btn variant="tonal" color="error" @click="store.resolvePaste('overwrite')">Overwrite</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

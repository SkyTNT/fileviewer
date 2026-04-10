<script setup>
import { computed, ref } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import { writeApi, filesApi } from '../../services/api.js'

const emit  = defineEmits(['open-file'])
const store = useFileStore()

const totalPages = computed(() => Math.ceil(store.total / store.pageSize))

const TYPE_ICON = {
  directory: 'mdi-folder',
  image:     'mdi-image-outline',
  parquet:   'mdi-table-large',
  json:      'mdi-code-json',
  jsonl:     'mdi-code-json',
  text:      'mdi-file-document-outline',
  video:     'mdi-play-circle-outline',
  audio:     'mdi-music-note',
  unknown:   'mdi-file-outline',
}
const TYPE_COLOR = {
  directory: 'primary',
  image:     'success',
  parquet:   'warning',
  json:      'secondary',
  jsonl:     'secondary',
  text:      'info',
  video:     'deep-purple',
  audio:     'pink',
}

const typeIcon  = t => TYPE_ICON[t]  || 'mdi-file-outline'
const typeColor = t => TYPE_COLOR[t] || undefined

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

let clickTimer = null

function onClick(file) {
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => store.selectEntry(file), 250)
}

function onDblClick(file) {
  clearTimeout(clickTimer)
  if (file.is_dir) store.navigate(file.path)
  else emit('open-file', file)
}

// ── Context menu (write mode) ─────────────────────────────────────────────────
const ctxMenu    = ref(false)
const ctxX       = ref(0)
const ctxY       = ref(0)
const ctxTarget  = ref(null)

function onContextMenu(e, file) {
  if (store.writeMode === false && file.is_dir) return
  e.preventDefault()
  ctxTarget.value = file
  ctxX.value = e.clientX
  ctxY.value = e.clientY
  ctxMenu.value = false
  // wait a tick so v-menu repositions correctly
  setTimeout(() => { ctxMenu.value = true }, 10)
}

// ── Rename ────────────────────────────────────────────────────────────────────
const renameDialog  = ref(false)
const renameName    = ref('')
const renameLoading = ref(false)
const renameError   = ref('')

function openRename() {
  ctxMenu.value    = false
  renameName.value  = ctxTarget.value?.name || ''
  renameError.value = ''
  renameDialog.value = true
}

async function confirmRename() {
  const newName = renameName.value.trim()
  if (!newName || newName === ctxTarget.value?.name) { renameDialog.value = false; return }
  renameLoading.value = true
  renameError.value   = ''
  try {
    await writeApi.rename(ctxTarget.value.path, newName)
    renameDialog.value = false
    store.loadDirectory(store.currentPath)
  } catch (e) {
    renameError.value = e.response?.data?.detail || e.message
  } finally {
    renameLoading.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deleteDialog  = ref(false)
const deleteLoading = ref(false)

function openDelete() {
  ctxMenu.value = false
  deleteDialog.value = true
}

async function confirmDelete() {
  deleteLoading.value = true
  try {
    await writeApi.delete(ctxTarget.value.path)
    deleteDialog.value = false
    store.loadDirectory(store.currentPath)
  } catch (e) {
    console.error('Delete failed', e)
  } finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <div class="list-scroll">
    <v-progress-linear v-if="store.loading" indeterminate color="primary" height="2" />

    <div v-if="!store.loading && store.total === 0" class="text-center text-grey pa-12">
      <v-icon size="64" class="mb-2">mdi-folder-open-outline</v-icon>
      <div>Empty directory</div>
    </div>

    <v-list v-else lines="one" class="pa-2" style="padding-bottom: 72px !important">
      <v-list-item
        v-for="file in store.entries"
        v-ripple
        :key="file.path"
        rounded="lg"
        density="comfortable"
        color="primary"
        :active="store.selectedEntry?.path === file.path"
        @click="onClick(file)"
        @dblclick="onDblClick(file)"
        @contextmenu="onContextMenu($event, file)"
      >
        <template #prepend>
          <v-avatar size="36" :color="typeColor(file.type)" variant="tonal" rounded="lg">
            <v-icon size="20">{{ typeIcon(file.type) }}</v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="text-body-2 font-weight-medium">
          {{ file.name }}
        </v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          {{ formatDate(file.modified) }}
        </v-list-item-subtitle>

        <template #append>
          <span class="text-caption text-medium-emphasis">
            {{ formatSize(file.size) }}
          </span>
        </template>
      </v-list-item>
    </v-list>

    <div v-if="totalPages > 1" class="pagination-fab">
      <v-pagination
        :model-value="store.page"
        :length="totalPages"
        :total-visible="7"
        @update:model-value="store.goToPage"
      />
    </div>
  </div>

  <!-- Right-click context menu -->
  <v-menu
    v-model="ctxMenu"
    :style="{ position: 'fixed', left: ctxX + 'px', top: ctxY + 'px' }"
    :close-on-content-click="true"
  >
    <v-list density="compact" min-width="160">
      <v-list-item
        v-if="!ctxTarget?.is_dir"
        prepend-icon="mdi-download-outline"
        title="Download"
        :href="filesApi.downloadUrl(ctxTarget?.path ?? '')"
        :download="ctxTarget?.name"
      />
      <template v-if="store.writeMode">
        <v-divider v-if="!ctxTarget?.is_dir" />
        <v-list-item prepend-icon="mdi-pencil-outline" title="Rename" @click="openRename" />
        <v-list-item prepend-icon="mdi-delete-outline" title="Delete" base-color="error" @click="openDelete" />
      </template>
    </v-list>
  </v-menu>

  <!-- Rename dialog -->
  <v-dialog v-model="renameDialog" max-width="360">
    <v-card>
      <v-card-title class="pa-4">Rename</v-card-title>
      <v-card-text class="pt-0">
        <v-text-field
          v-model="renameName"
          label="New name"
          autofocus
          :error-messages="renameError"
          @keydown.enter="confirmRename"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="renameDialog = false">Cancel</v-btn>
        <v-btn color="primary" :loading="renameLoading" @click="confirmRename">Rename</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Delete confirm dialog -->
  <v-dialog v-model="deleteDialog" max-width="360">
    <v-card>
      <v-card-title class="pa-4">Delete</v-card-title>
      <v-card-text class="pt-0">
        Are you sure you want to delete <strong>{{ ctxTarget?.name }}</strong>?
        <span v-if="ctxTarget?.is_dir" class="text-error d-block mt-1 text-body-2">
          This will delete the folder and all its contents.
        </span>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
        <v-btn color="error" :loading="deleteLoading" @click="confirmDelete">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.list-scroll {
  height: 100%;
  overflow-y: auto;
}
.pagination-fab {
  position: fixed;
  bottom: 16px;
  left: calc(var(--v-layout-left, 0px) + 16px);
  z-index: 10;
  background: rgb(var(--v-theme-surface));
  border-radius: 28px;
  box-shadow: 0 3px 10px rgba(0,0,0,.2);
  padding: 4px 8px;
}
</style>

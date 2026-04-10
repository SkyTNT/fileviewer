<script setup>
import { computed, ref } from 'vue'
import { imagesApi, writeApi, filesApi } from '../../services/api.js'
import { useFileStore } from '../../stores/fileStore.js'

const props = defineProps({
  file: { type: Object, required: true },
})
const emit  = defineEmits(['open', 'navigate'])
const store = useFileStore()

const isSelected = computed(() => store.selectedEntry?.path === props.file.path)

const isImage = computed(() => props.file.type === 'image')
const thumbnailUrl = computed(() =>
  isImage.value ? imagesApi.thumbnailUrl(props.file.path, 400) : null
)

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

const typeIcon  = computed(() => TYPE_ICON[props.file.type]  || 'mdi-file-outline')
const typeColor = computed(() => TYPE_COLOR[props.file.type] || 'surface-variant')

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

let clickTimer = null

function onClick() {
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => store.selectEntry(props.file), 250)
}

function onDblClick() {
  clearTimeout(clickTimer)
  if (props.file.is_dir) emit('navigate', props.file.path)
  else emit('open', props.file)
}

// ── Context menu ──────────────────────────────────────────────────────────────
const ctxMenu = ref(false)
const ctxX    = ref(0)
const ctxY    = ref(0)

function onContextMenu(e) {
  if (!store.writeMode && props.file.is_dir) return
  e.preventDefault()
  ctxX.value = e.clientX
  ctxY.value = e.clientY
  ctxMenu.value = false
  setTimeout(() => { ctxMenu.value = true }, 10)
}

// ── Rename ────────────────────────────────────────────────────────────────────
const renameDialog  = ref(false)
const renameName    = ref('')
const renameLoading = ref(false)
const renameError   = ref('')

function openRename() {
  ctxMenu.value     = false
  renameName.value  = props.file.name
  renameError.value = ''
  renameDialog.value = true
}

async function confirmRename() {
  const newName = renameName.value.trim()
  if (!newName || newName === props.file.name) { renameDialog.value = false; return }
  renameLoading.value = true
  renameError.value   = ''
  try {
    await writeApi.rename(props.file.path, newName)
    renameDialog.value = false
    store.invalidateTree()
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
  ctxMenu.value      = false
  deleteDialog.value = true
}

async function confirmDelete() {
  deleteLoading.value = true
  try {
    await writeApi.delete(props.file.path)
    deleteDialog.value = false
    store.invalidateTree()
    store.loadDirectory(store.currentPath)
  } catch (e) {
    console.error('Delete failed', e)
  } finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <v-card
    v-ripple
    class="file-card"
    rounded="lg"
    :elevation="isSelected ? 4 : 1"
    :class="{ 'file-card--selected': isSelected }"
    hover
    @click="onClick"
    @dblclick="onDblClick"
    @contextmenu="onContextMenu"
  >
    <!-- Image thumbnail -->
    <img
      v-if="isImage"
      :src="thumbnailUrl"
      :alt="file.name"
      loading="lazy"
      class="thumb-img"
    />

    <!-- Non-image icon area -->
    <div v-else class="icon-area d-flex flex-column align-center justify-center">
      <v-icon :color="typeColor" size="48">{{ typeIcon }}</v-icon>
      <v-chip
        class="mt-2"
        size="x-small"
        :color="typeColor"
        variant="tonal"
        label
      >
        {{ file.extension || file.type }}
      </v-chip>
    </div>

    <v-divider />

    <v-card-text class="py-2 px-3">
      <div class="text-body-2 font-weight-medium text-truncate" :title="file.name">
        {{ file.name }}
      </div>
      <div v-if="file.size != null" class="text-caption text-medium-emphasis">
        {{ formatSize(file.size) }}
      </div>
    </v-card-text>
  </v-card>

  <!-- Right-click context menu -->
  <v-menu
    v-model="ctxMenu"
    :style="{ position: 'fixed', left: ctxX + 'px', top: ctxY + 'px' }"
    :close-on-content-click="true"
  >
    <v-list density="compact" min-width="160">
      <v-list-item
        v-if="!file.is_dir"
        prepend-icon="mdi-download-outline"
        title="Download"
        :href="filesApi.downloadUrl(file.path)"
        :download="file.name"
      />
      <template v-if="store.writeMode">
        <v-divider v-if="!file.is_dir" />
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
        Are you sure you want to delete <strong>{{ file.name }}</strong>?
        <span v-if="file.is_dir" class="text-error d-block mt-1 text-body-2">
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
.file-card {
  break-inside: avoid;
  margin-bottom: 8px;
  cursor: pointer;
  transition: outline 0.1s;
}
.file-card--selected {
  outline: 2px solid rgb(var(--v-theme-primary));
}
.thumb-img {
  width: 100%;
  height: auto;
  display: block;
}
.icon-area {
  height: 110px;
}
</style>

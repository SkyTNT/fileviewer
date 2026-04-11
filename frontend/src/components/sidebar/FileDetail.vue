<script setup>
import { computed, ref, watch } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import { imagesApi, filesApi, textApi } from '../../services/api.js'
import { writeApi } from '../../services/api.js'
import { useCopyToClipboard } from '../../composables/useCopyToClipboard.js'
import JsonNode from '../viewers/JsonNode.vue'

const emit  = defineEmits(['open-file'])
const store = useFileStore()

// Single-select (when exactly 1 item selected)
const file  = computed(() => store.selectedEntry)

// ── Multi-select computed ────────────────────────────────────────────────────
const isMulti     = computed(() => store.selectedEntries.length > 1)
const multiFiles  = computed(() => store.selectedEntries.filter(e => !e.is_dir))
const multiDirs   = computed(() => store.selectedEntries.filter(e =>  e.is_dir))
const multiSize   = computed(() => multiFiles.value.reduce((s, e) => s + (e.size ?? 0), 0))

function downloadSelected() {
  multiFiles.value.forEach(f => {
    const a = document.createElement('a')
    a.href = filesApi.downloadUrl(f.path)
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  })
}

function copySelected() { if (store.selectedEntries.length) store.setCopy(store.selectedEntries[0]) }
function cutSelected()  { if (store.selectedEntries.length) store.setCut(store.selectedEntries[0])  }

function openEntry() {
  if (!file.value) return
  if (file.value.is_dir) {
    store.navigate(file.value.path)
    store.selectEntry(null)
  } else {
    emit('open-file', file.value)
  }
}

const isImage = computed(() => file.value?.type === 'image')
const imgError = ref(false)

const { copyLoading, copiedOk, copyError, copyToClipboard: _copyToClipboard } = useCopyToClipboard()
const copyToClipboard = () => _copyToClipboard(file.value)

watch(file, () => { imgError.value = false; copiedOk.value = false; copyError.value = '' })

// Same-name .json meta file
const metaData    = ref(null)
const metaLoading = ref(false)

watch(file, async (f) => {
  metaData.value = null
  if (!f || f.type !== 'image' || !f.extension) return
  const jsonPath = f.path.slice(0, -f.extension.length) + '.json'
  metaLoading.value = true
  try {
    const res = await textApi.getContent(jsonPath)
    metaData.value = JSON.parse(res.data.content)
  } catch {
    metaData.value = null
  } finally {
    metaLoading.value = false
  }
}, { immediate: true })

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

const typeIcon  = computed(() => TYPE_ICON[file.value?.type] || 'mdi-file-outline')
const typeColor = computed(() => TYPE_COLOR[file.value?.type] || 'surface-variant')

function formatSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

// ── Rename ────────────────────────────────────────────────────────────────────
const renameDialog  = ref(false)
const renameName    = ref('')
const renameLoading = ref(false)
const renameError   = ref('')

function openRename() {
  renameName.value  = file.value?.name || ''
  renameError.value = ''
  renameDialog.value = true
}

async function confirmRename() {
  const newName = renameName.value.trim()
  if (!newName || newName === file.value?.name) { renameDialog.value = false; return }
  renameLoading.value = true
  renameError.value   = ''
  try {
    await writeApi.rename(file.value.path, newName)
    renameDialog.value = false
    store.selectEntry(null)
    store.invalidateTree()
    store.loadDirectory(store.currentPath)
  } catch (e) {
    renameError.value = e.response?.data?.detail || e.message
  } finally {
    renameLoading.value = false
  }
}

// ── Multi-delete ──────────────────────────────────────────────────────────────
const multiDeleteDialog = ref(false)

async function confirmMultiDelete() {
  const targets = [...store.selectedEntries]
  multiDeleteDialog.value = false
  try {
    await store.deleteEntries(targets)
  } catch (e) {
    console.error('Multi-delete failed', e)
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deleteDialog  = ref(false)
const deleteLoading = ref(false)

async function confirmDelete() {
  deleteLoading.value = true
  try {
    await writeApi.delete(file.value.path)
    deleteDialog.value = false
    store.selectEntry(null)
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
  <!-- ── Multi-select panel ───────────────────────────────────────────────── -->
  <div v-if="isMulti" class="detail-panel">
    <div class="d-flex align-center px-3 pt-3 pb-1">
      <span class="text-subtitle-2 font-weight-bold">{{ store.selectedEntries.length }} items selected</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="store.clearSelection()">
        <v-icon size="18">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-divider />

    <!-- Preview area -->
    <div class="preview-area pa-4 d-flex align-center justify-center">
      <v-icon color="primary" size="80">mdi-checkbox-multiple-marked-outline</v-icon>
    </div>

    <v-divider />

    <!-- Actions -->
    <div class="px-3 pt-3 d-flex flex-column ga-2">
      <v-btn
        v-if="multiFiles.length"
        color="secondary"
        variant="tonal"
        block
        prepend-icon="mdi-download"
        @click="downloadSelected"
      >
        Download {{ multiFiles.length }} files
      </v-btn>

      <template v-if="store.writeMode">
        <div class="d-flex ga-2">
          <v-btn
            color="secondary"
            variant="tonal"
            style="flex:1"
            prepend-icon="mdi-content-copy"
            @click="copySelected"
          >
            Copy
          </v-btn>
          <v-btn
            color="secondary"
            variant="tonal"
            style="flex:1"
            prepend-icon="mdi-content-cut"
            @click="cutSelected"
          >
            Cut
          </v-btn>
        </div>
        <v-btn
          color="error"
          variant="tonal"
          block
          prepend-icon="mdi-delete-outline"
          @click="multiDeleteDialog = true"
        >
          Delete {{ store.selectedEntries.length }} items
        </v-btn>
      </template>
    </div>

    <!-- Summary -->
    <div class="info-list pa-3">
      <div v-if="multiFiles.length" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Files</span>
        <span class="info-value text-body-2">{{ multiFiles.length }}</span>
      </div>
      <div v-if="multiDirs.length" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Folders</span>
        <span class="info-value text-body-2">{{ multiDirs.length }}</span>
      </div>
      <div v-if="multiFiles.length" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Total size</span>
        <span class="info-value text-body-2">{{ formatSize(multiSize) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Selected</span>
        <div class="d-flex flex-column ga-1 mt-1">
          <span
            v-for="entry in store.selectedEntries.slice(0, 10)"
            :key="entry.path"
            class="info-value text-body-2 text-truncate"
            :title="entry.name"
          >
            <v-icon size="14" class="mr-1" :color="entry.is_dir ? 'primary' : undefined">
              {{ entry.is_dir ? 'mdi-folder' : 'mdi-file-outline' }}
            </v-icon>{{ entry.name }}
          </span>
          <span v-if="store.selectedEntries.length > 10" class="text-caption text-medium-emphasis">
            … and {{ store.selectedEntries.length - 10 }} more
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Single-select panel ──────────────────────────────────────────────── -->
  <div v-else-if="file" class="detail-panel">
    <!-- Header -->
    <div class="d-flex align-center px-3 pt-3 pb-1">
      <span class="text-subtitle-2 font-weight-bold">Details</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="store.selectEntry(null)">
        <v-icon size="18">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-divider />

    <!-- Preview -->
    <div class="preview-area pa-4 d-flex align-center justify-center">
      <img
        v-if="isImage && !imgError"
        :src="imagesApi.thumbnailUrl(file.path, 400)"
        class="preview-img"
        :alt="file.name"
        @error="imgError = true"
      />
      <v-icon v-else :color="typeColor" size="80">{{ typeIcon }}</v-icon>
    </div>

    <v-divider />

    <!-- Action buttons -->
    <div class="px-3 pt-3 d-flex flex-column ga-2">
      <!-- Open -->
      <v-btn
        color="primary"
        variant="tonal"
        block
        :prepend-icon="file.is_dir ? 'mdi-folder-open-outline' : 'mdi-open-in-app'"
        @click="openEntry"
      >
        Open
      </v-btn>

      <!-- Download (files only) -->
      <v-btn
        v-if="!file.is_dir"
        :href="filesApi.downloadUrl(file.path)"
        :download="file.name"
        color="secondary"
        variant="tonal"
        block
        prepend-icon="mdi-download"
      >
        Download
      </v-btn>

      <!-- Copy to clipboard -->
      <v-btn
        v-if="!file.is_dir"
        :loading="copyLoading"
        :color="copyError ? 'error' : copiedOk ? 'success' : 'secondary'"
        variant="tonal"
        block
        :prepend-icon="copyError ? 'mdi-alert-circle-outline' : copiedOk ? 'mdi-check' : 'mdi-clipboard-outline'"
        @click="copyToClipboard"
      >
        {{ copyError || (copiedOk ? 'Copied!' : 'Copy to clipboard') }}
      </v-btn>

      <!-- Write mode actions -->
      <template v-if="store.writeMode">
        <div class="d-flex ga-2">
          <v-btn
            color="secondary"
            variant="tonal"
            style="flex:1"
            prepend-icon="mdi-content-copy"
            @click="store.setCopy(file)"
          >
            Copy
          </v-btn>
          <v-btn
            color="secondary"
            variant="tonal"
            style="flex:1"
            prepend-icon="mdi-content-cut"
            @click="store.setCut(file)"
          >
            Cut
          </v-btn>
        </div>
        <v-btn
          color="secondary"
          variant="tonal"
          block
          prepend-icon="mdi-pencil-outline"
          @click="openRename"
        >
          Rename
        </v-btn>
        <v-btn
          color="error"
          variant="tonal"
          block
          prepend-icon="mdi-delete-outline"
          @click="deleteDialog = true"
        >
          Delete
        </v-btn>
      </template>
    </div>

    <!-- Info rows -->
    <div class="info-list pa-3">
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Name</span>
        <span class="info-value text-body-2 text-wrap">{{ file.name }}</span>
      </div>

      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Type</span>
        <v-chip size="x-small" :color="typeColor" variant="tonal" label>
          {{ file.type }}
        </v-chip>
      </div>

      <div v-if="file.extension" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Extension</span>
        <span class="info-value text-body-2">{{ file.extension }}</span>
      </div>

      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Size</span>
        <span class="info-value text-body-2">{{ formatSize(file.size) }}</span>
      </div>

      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Modified</span>
        <span class="info-value text-body-2">{{ formatDate(file.modified) }}</span>
      </div>

      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Path</span>
        <span class="info-value text-body-2 text-wrap path-text">{{ file.path || '/' }}</span>
      </div>
    </div>

    <!-- JSON meta from sibling .json file -->
    <template v-if="isImage">
      <v-divider class="mt-1" />
      <div class="px-3 pt-3 pb-1 d-flex align-center">
        <span class="text-caption text-medium-emphasis" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px">Meta</span>
        <v-progress-circular v-if="metaLoading" indeterminate size="12" width="2" class="ml-2" />
        <span v-else-if="!metaData" class="text-caption text-disabled ml-2">no .json found</span>
      </div>
      <div v-if="metaData" class="px-3 pb-3 meta-tree">
        <JsonNode :value="metaData" :depth="0" />
      </div>
    </template>
  </div>

  <!-- Multi-delete confirm dialog -->
  <v-dialog v-model="multiDeleteDialog" max-width="400">
    <v-card>
      <v-card-title class="pa-4">Delete {{ store.selectedEntries.length }} items</v-card-title>
      <v-card-text class="pt-0">
        Are you sure you want to delete {{ store.selectedEntries.length }} items? This cannot be undone.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="multiDeleteDialog = false">Cancel</v-btn>
        <v-btn color="error" @click="confirmMultiDelete">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

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
        Are you sure you want to delete <strong>{{ file?.name }}</strong>?
        <span v-if="file?.is_dir" class="text-error d-block mt-1 text-body-2">
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
.detail-panel {
  height: 100%;
  overflow-y: auto;
}
.preview-area {
  min-height: 160px;
}
.preview-img {
  width: 100%;
  height: auto;
  border-radius: 8px;
  display: block;
}
.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.info-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.info-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.info-value {
  word-break: break-all;
}
.path-text {
  font-family: 'Roboto Mono', monospace;
  font-size: 12px;
}
.meta-tree {
  overflow-x: auto;
}
</style>

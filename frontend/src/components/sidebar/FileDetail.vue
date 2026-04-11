<script setup>
import { computed, ref, watch } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import { imagesApi, filesApi, textApi } from '../../services/api.js'
import { useCopyToClipboard } from '../../composables/useCopyToClipboard.js'
import { useWriteActions } from '../../composables/useWriteActions.js'
import { TYPE_ICON, TYPE_COLOR, formatBytes } from '../../utils/fileTypes.js'
import JsonNode from '../viewers/JsonNode.vue'
import DialogRename from '../dialogs/DialogRename.vue'
import DialogConfirmDelete from '../dialogs/DialogConfirmDelete.vue'

const emit  = defineEmits(['open-file'])
const store = useFileStore()

// Single-select (when exactly 1 item selected)
const file     = computed(() => store.selectedEntry)
const canWrite = computed(() => store.writeMode && store.currentPath !== '')

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

const { copyLoading, copyToClipboard: _copyToClipboard } = useCopyToClipboard()
const copyToClipboard = () => _copyToClipboard(file.value)

watch(file, () => { imgError.value = false })

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

const typeIcon  = computed(() => TYPE_ICON[file.value?.type] || 'mdi-file-outline')
const typeColor = computed(() => TYPE_COLOR[file.value?.type] || 'surface-variant')
const formatSize = (bytes) => formatBytes(bytes, '—')

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

const {
  renameDialog, renameName, renameLoading, renameError, openRename, confirmRename,
  deleteDialog, deleteTargets, openDelete, confirmDelete,
} = useWriteActions()
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

      <template v-if="canWrite">
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
          @click="openDelete(store.selectedEntries)"
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
        color="secondary"
        variant="tonal"
        block
        prepend-icon="mdi-clipboard-outline"
        @click="copyToClipboard"
      >
        Copy to clipboard
      </v-btn>

      <!-- Write mode actions -->
      <template v-if="canWrite">
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
          @click="openRename(file, () => store.selectEntry(null))"
        >
          Rename
        </v-btn>
        <v-btn
          color="error"
          variant="tonal"
          block
          prepend-icon="mdi-delete-outline"
          @click="openDelete(file)"
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

  <DialogRename
    v-model="renameDialog"
    v-model:name="renameName"
    :loading="renameLoading"
    :error="renameError"
    @confirm="confirmRename"
  />
  <DialogConfirmDelete v-model="deleteDialog" :targets="deleteTargets" @confirm="confirmDelete" />
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

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import { writeApi, filesApi } from '../../services/api.js'
import { useWriteActions } from '../../composables/useWriteActions.js'
import { useRubberBand } from '../../composables/useRubberBand.js'
import { useMultiDelete } from '../../composables/useMultiDelete.js'
import ContextMenu from './ContextMenu.vue'

const emit  = defineEmits(['open-file', 'error'])
const store = useFileStore()

const {
  mkdirDialog, mkdirName, mkdirLoading, mkdirError, openMkdir, confirmMkdir,
  touchDialog, touchName, touchLoading, touchError, openTouch, confirmTouch,
  pasteLoading, doPaste: _doPaste,
} = useWriteActions((msg) => emit('error', msg))

const { multiDeleteDialog, multiDeleteTargets, openMultiDelete, confirmMultiDelete } =
  useMultiDelete((msg) => emit('error', msg))

// ── Single shared context menu ────────────────────────────────────────────────
const menuOpen   = ref(false)
const menuX      = ref(0)
const menuY      = ref(0)
const menuTarget = ref(null)   // null = background, object = file

function showMenu(x, y, file = null) {
  menuTarget.value = file
  menuX.value = x
  menuY.value = y
  menuOpen.value = false
  setTimeout(() => { menuOpen.value = true }, 10)
}

function onBgContextMenu(e) {
  const canShow = store.writeMode && !store.isAtHome
  if (!canShow && !store.clipboard) return
  e.preventDefault()
  showMenu(e.clientX, e.clientY, null)
}

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

function onClick(e, file) {
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => {
    if (e.shiftKey)               store.shiftSelectTo(file, store.entries)
    else if (e.ctrlKey || e.metaKey) store.toggleEntry(file)
    else                          store.selectEntry(file)
  }, 250)
}

function onDblClick(file) {
  clearTimeout(clickTimer)
  if (file.is_dir) store.navigate(file.path)
  else emit('open-file', file)
}

async function doPaste() { await _doPaste() }

function onContextMenu(e, file) {
  e.preventDefault()
  e.stopPropagation()
  if (store.currentPath === '' && file.is_dir) return
  const hasMenu = store.writeMode || store.clipboard || !file.is_dir
  if (!hasMenu) return
  showMenu(e.clientX, e.clientY, file)
}

// ── Rename ────────────────────────────────────────────────────────────────────
const renameDialog  = ref(false)
const renameName    = ref('')
const renameLoading = ref(false)
const renameError   = ref('')

function openRename() {
  renameName.value  = menuTarget.value?.name || ''
  renameError.value = ''
  renameDialog.value = true
}

async function confirmRename() {
  const newName = renameName.value.trim()
  if (!newName || newName === menuTarget.value?.name) { renameDialog.value = false; return }
  renameLoading.value = true
  renameError.value   = ''
  try {
    await writeApi.rename(menuTarget.value.path, newName)
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
const deleteDialog = ref(false)

async function confirmDelete() {
  deleteDialog.value = false
  await store.deleteEntries([menuTarget.value])
}

// ── Rubber-band selection ─────────────────────────────────────────────────────
const scrollRef = ref(null)

function onRubberSelect(paths, ctrlHeld) {
  if (!paths.length) { if (!ctrlHeld) store.clearSelection(); return }
  const pathSet = new Set(paths)
  const items = store.entries.filter(e => pathSet.has(e.path))
  if (ctrlHeld) store.addToSelection(items)
  else          store.setSelection(items)
}

const { isDragging: rbDragging, selRect: rbRect, onMouseDown: rbMouseDown } =
  useRubberBand(scrollRef, onRubberSelect)

function onKeyDown(e) {
  if (!e.ctrlKey && !e.metaKey) return
  const el = document.activeElement
  if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
  if (el?.closest('[role="dialog"]')) return

  switch (e.key) {
    case 'a':
      e.preventDefault()
      store.setSelection([...store.entries])
      break
    case 'c':
      if (store.selectedEntries.length) {
        e.preventDefault()
        store.setCopy(store.selectedEntries[0])
      }
      break
    case 'x':
      if (store.writeMode && store.selectedEntries.length) {
        e.preventDefault()
        store.setCut(store.selectedEntries[0])
      }
      break
    case 'v':
      if (store.writeMode && store.clipboard && !store.isAtHome) {
        e.preventDefault()
        store.paste()
      }
      break
  }
}

onMounted(()   => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div ref="scrollRef" class="list-scroll" @contextmenu="onBgContextMenu" @mousedown="rbMouseDown">
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
        :data-path="file.path"
        rounded="lg"
        density="comfortable"
        color="primary"
        :active="store.selectedEntries.some(e => e.path === file.path)"
        @click="onClick($event, file)"
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

  <!-- Rubber-band selection overlay -->
  <div
    v-if="rbDragging"
    class="rubberband-rect"
    :style="{ left: rbRect.left + 'px', top: rbRect.top + 'px', width: rbRect.width + 'px', height: rbRect.height + 'px' }"
  />

  <!-- Single shared context menu -->
  <ContextMenu
    v-model="menuOpen"
    :x="menuX" :y="menuY"
    :file="menuTarget"
    @rename="openRename"
    @delete="deleteDialog = true"
    @delete-multi="openMultiDelete"
    @mkdir="openMkdir"
    @touch="openTouch"
    @paste="doPaste"
    @error="emit('error', $event)"
  />

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
        Are you sure you want to delete <strong>{{ menuTarget?.name }}</strong>?
        <span v-if="menuTarget?.is_dir" class="text-error d-block mt-1 text-body-2">
          This will delete the folder and all its contents.
        </span>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
        <v-btn color="error" @click="confirmDelete">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>


  <!-- Multi-delete confirm dialog -->
  <v-dialog v-model="multiDeleteDialog" max-width="400">
    <v-card>
      <v-card-title class="pa-4">Delete {{ multiDeleteTargets.length }} items</v-card-title>
      <v-card-text class="pt-0">
        Are you sure you want to delete {{ multiDeleteTargets.length }} items? This cannot be undone.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="multiDeleteDialog = false">Cancel</v-btn>
        <v-btn color="error" @click="confirmMultiDelete">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- New Folder dialog -->
  <v-dialog v-model="mkdirDialog" max-width="360" @keydown.enter="confirmMkdir">
    <v-card>
      <v-card-title class="pa-4">New Folder</v-card-title>
      <v-card-text class="pt-0">
        <v-text-field v-model="mkdirName" label="Folder name" autofocus :error-messages="mkdirError" @keydown.enter="confirmMkdir" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="mkdirDialog = false">Cancel</v-btn>
        <v-btn color="primary" :loading="mkdirLoading" @click="confirmMkdir">Create</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- New File dialog -->
  <v-dialog v-model="touchDialog" max-width="360">
    <v-card>
      <v-card-title class="pa-4">New File</v-card-title>
      <v-card-text class="pt-0">
        <v-text-field v-model="touchName" label="File name" autofocus :error-messages="touchError" @keydown.enter="confirmTouch" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="touchDialog = false">Cancel</v-btn>
        <v-btn color="primary" :loading="touchLoading" @click="confirmTouch">Create</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.list-scroll {
  height: 100%;
  overflow-y: auto;
}
.rubberband-rect {
  position: fixed;
  pointer-events: none;
  border: 1px solid rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
  z-index: 999;
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

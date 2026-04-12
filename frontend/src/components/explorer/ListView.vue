<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileStore } from '../../stores/fileStore.js'
import { useWriteActions } from '../../composables/useWriteActions.js'
import { useRubberBand } from '../../composables/useRubberBand.js'
import { TYPE_ICON, TYPE_COLOR, formatBytes } from '../../utils/fileTypes.js'
import ContextMenu from './ContextMenu.vue'
import DialogRename from '../dialogs/DialogRename.vue'
import DialogConfirmDelete from '../dialogs/DialogConfirmDelete.vue'
import DialogNewItem from '../dialogs/DialogNewItem.vue'

const emit  = defineEmits(['open-file'])
const store = useFileStore()
const { t } = useI18n()

const {
  mkdirDialog, mkdirName, mkdirLoading, mkdirError, openMkdir, confirmMkdir,
  touchDialog, touchName, touchLoading, touchError, openTouch, confirmTouch,
  pasteLoading, doPaste,
  renameDialog, renameName, renameLoading, renameError, openRename, confirmRename,
  deleteDialog, deleteTargets, openDelete, confirmDelete,
} = useWriteActions()

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

const pageInput = ref(store.page)
watch(() => store.page, v => { pageInput.value = v })

function goToListPage() {
  const val = parseInt(pageInput.value)
  if (!isNaN(val)) {
    const clamped = Math.max(1, Math.min(val, totalPages.value))
    if (clamped !== store.page) store.goToPage(clamped)
  }
  pageInput.value = store.page
}

const typeIcon  = t => TYPE_ICON[t]  || 'mdi-file-outline'
const typeColor = t => TYPE_COLOR[t] || undefined
const formatSize = (bytes) => formatBytes(bytes)

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

function onContextMenu(e, file) {
  e.preventDefault()
  e.stopPropagation()
  if (store.currentPath === '' && file.is_dir) return
  const hasMenu = store.writeMode || store.clipboard || !file.is_dir
  if (!hasMenu) return
  showMenu(e.clientX, e.clientY, file)
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
        doPaste()
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
      <div>{{ t('explorer.emptyDirectory') }}</div>
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

    <div v-if="totalPages > 1" class="pagination-fab d-flex align-center ga-1">
      <v-btn icon size="small" variant="text" :disabled="store.page <= 1" @click="store.goToPage(1)">
        <v-icon>mdi-page-first</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="text" :disabled="store.page <= 1" @click="store.goToPage(store.page - 1)">
        <v-icon>mdi-chevron-left</v-icon>
      </v-btn>
      <input
        v-model.number="pageInput"
        class="page-input"
        type="number"
        min="1"
        :max="totalPages"
        @keydown.enter.prevent="goToListPage"
        @blur="goToListPage"
      />
      <span class="text-body-2">/ {{ totalPages }}</span>
      <v-btn icon size="small" variant="text" :disabled="store.page >= totalPages" @click="store.goToPage(store.page + 1)">
        <v-icon>mdi-chevron-right</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="text" :disabled="store.page >= totalPages" @click="store.goToPage(totalPages)">
        <v-icon>mdi-page-last</v-icon>
      </v-btn>
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
    @rename="openRename(menuTarget)"
    @delete="openDelete(menuTarget)"
    @delete-multi="openDelete"
    @mkdir="openMkdir"
    @touch="openTouch"
    @paste="doPaste"
  />

  <DialogRename
    v-model="renameDialog"
    v-model:name="renameName"
    :loading="renameLoading"
    :error="renameError"
    @confirm="confirmRename"
  />
  <DialogConfirmDelete v-model="deleteDialog" :targets="deleteTargets" @confirm="confirmDelete" />
  <DialogNewItem
    v-model="mkdirDialog"
    :title="t('dialog.newFolder')"
    :label="t('dialog.folderName')"
    v-model:name="mkdirName"
    :loading="mkdirLoading"
    :error="mkdirError"
    @confirm="confirmMkdir"
  />
  <DialogNewItem
    v-model="touchDialog"
    :title="t('dialog.newFile')"
    :label="t('dialog.fileName')"
    v-model:name="touchName"
    :loading="touchLoading"
    :error="touchError"
    @confirm="confirmTouch"
  />
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
.page-input {
  width: 52px;
  text-align: center;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  padding: 3px 4px;
  font-size: 13px;
  background: transparent;
  color: inherit;
  outline: none;
}
.page-input:focus {
  border-color: rgb(var(--v-theme-primary));
  border-width: 2px;
}
.page-input::-webkit-inner-spin-button,
.page-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.page-input[type=number] { -moz-appearance: textfield; }
</style>

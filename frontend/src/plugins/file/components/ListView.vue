<script setup>
import { computed, ref, onActivated, onDeactivated } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileStore } from '@/plugins/file/store.js'
import { useViewerStore } from '@/plugins/viewer/store.js'
import { useRubberBand } from '../useRubberBand.js'
import { useContextMenu } from '../useContextMenu.js'
import { useExplorerKeyboard } from '../useExplorerKeyboard.js'
import { TYPE_ICON, TYPE_COLOR, formatBytes, formatDate } from '@/utils/fileTypes.js'
import ContextMenu from './ContextMenu.vue'
import PaginationBar from '@/components/PaginationBar.vue'

const store       = useFileStore()
const viewerStore = useViewerStore()
const { t } = useI18n()


const { menuOpen, menuX, menuY, showMenu, onBgContextMenu } = useContextMenu()

useExplorerKeyboard(store.entries)

onActivated(()   => store.setRefreshHook(() => store.goToPage(store.page)))
onDeactivated(() => store.setRefreshHook(null))

const totalPages = computed(() => Math.ceil(store.total / store.pageSize))

const typeIcon   = t => TYPE_ICON[t]  || 'mdi-file-outline'
const typeColor  = t => TYPE_COLOR[t] || undefined
const formatSize = (bytes) => formatBytes(bytes)

let clickTimer = null

function onClick(e, file) {
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => {
    if (e.shiftKey)                   store.shiftSelectTo(file, store.entries)
    else if (e.ctrlKey || e.metaKey)  store.toggleEntry(file)
    else                              store.selectEntry(file)
  }, 250)
}

function onDblClick(file) {
  clearTimeout(clickTimer)
  if (file.is_dir) store.navigate(file.path)
  else viewerStore.open(file)
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
</script>

<template>
  <div ref="scrollRef" class="list-scroll" @contextmenu="onBgContextMenu" @mousedown="rbMouseDown">
    <div v-if="store.total === 0 && !store.loading" class="text-center text-grey pa-12">
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

        <v-list-item-title class="text-body-2 font-weight-medium d-flex align-center" style="min-width:0">
          <span class="text-truncate">{{ file.name }}</span>
          <v-icon v-if="file.is_symlink" size="13" color="medium-emphasis" class="ml-1 flex-shrink-0">mdi-link-variant</v-icon>
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
      <PaginationBar
        :model-value="store.page"
        :total="totalPages"
        :disabled="store.loading"
        @navigate="store.goToPage"
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
  <ContextMenu v-model="menuOpen" :x="menuX" :y="menuY" />
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

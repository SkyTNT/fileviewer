<script setup>
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import { useWriteActions } from '../../composables/useWriteActions.js'
import { useRubberBand } from '../../composables/useRubberBand.js'
import { useMultiDelete } from '../../composables/useMultiDelete.js'
import { writeApi } from '../../services/api.js'
import FileCard from './FileCard.vue'
import ContextMenu from './ContextMenu.vue'

const emit = defineEmits(['open-file', 'error'])
const store = useFileStore()

const {
  mkdirDialog, mkdirName, mkdirLoading, mkdirError, openMkdir, confirmMkdir,
  touchDialog, touchName, touchLoading, touchError, openTouch, confirmTouch,
  doPaste,
} = useWriteActions((msg) => emit('error', msg))

const { multiDeleteDialog, multiDeleteTargets, openMultiDelete, confirmMultiDelete } =
  useMultiDelete((msg) => emit('error', msg))

// ── Single context menu (shared between cards and background) ─────────────────
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

function onCardContextMenu({ file, x, y }) {
  showMenu(x, y, file)
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
const deleteDialog  = ref(false)
const deleteLoading = ref(false)

async function confirmDelete() {
  deleteLoading.value = true
  try {
    await writeApi.delete(menuTarget.value.path)
    deleteDialog.value = false
    store.invalidateTree()
    store.loadDirectory(store.currentPath)
  } catch (e) {
    emit('error', e.response?.data?.detail || e.message)
  } finally {
    deleteLoading.value = false
  }
}

// ── Background context menu ───────────────────────────────────────────────────
function onBgContextMenu(e) {
  const canShow = store.writeMode && !(store.multiRoot && store.currentPath === '')
  if (!canShow && !store.clipboard) return
  e.preventDefault()
  showMenu(e.clientX, e.clientY, null)
}

const displayEntries = ref([])
const sentinelRef    = ref(null)
const containerRef   = ref(null)

const GAP = 8

function widthToColCount(w) {
  return w < 300 ? 1 : w < 480 ? 2 : w < 720 ? 3 : w < 960 ? 4 : w < 1280 ? 5 : 6
}

const colCount = ref(widthToColCount(window.innerWidth))
const colWidth  = ref(0)

function estimatedHeight(file) {
  return file.type === 'image' ? 220 : 150
}

// ── Height tracking ──────────────────────────────────────────────────────────
const cardHeights = {}
const cardROs     = {}

function attachCardRef(el, path) {
  if (el) {
    if (!cardROs[path]) {
      const ro = new ResizeObserver(() => {
        const h = el.offsetHeight
        if (cardHeights[path] !== h) { cardHeights[path] = h; scheduleLayout() }
      })
      ro.observe(el)
      cardROs[path] = ro
    }
  } else {
    cardROs[path]?.disconnect()
    delete cardROs[path]
  }
}

// ── Absolute position layout ─────────────────────────────────────────────────
// All cards live in one flat v-for. Column reassignment only changes CSS
// transform — no component destroy/create cycle ever happens.
const cardPositions   = reactive({})  // path → { x, y }，Vue 按 key 单独追踪
const containerHeight = ref(0)
let savedColHeights   = []
let rafId = null

function runLayout() {
  const n  = colCount.value
  const cw = colWidth.value
  if (cw === 0) return
  const heights = new Array(n).fill(0)
  for (const file of displayEntries.value) {
    const minIdx = heights.indexOf(Math.min(...heights))
    cardPositions[file.path] = { x: minIdx * (cw + GAP), y: heights[minIdx] }
    heights[minIdx] += (cardHeights[file.path] ?? estimatedHeight(file)) + GAP
  }
  savedColHeights       = heights
  containerHeight.value = heights.length ? Math.max(...heights) : 0
}

// RAF debounce：同一帧内的多次高度变化只触发一次 runLayout。
function scheduleLayout() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => { rafId = null; runLayout() })
}

// 翻页追加：只计算新条目的位置，已有卡片的 transform 完全不动。
function appendLayout(prevCount) {
  const n  = colCount.value
  const cw = colWidth.value
  if (cw === 0 || prevCount === 0 || savedColHeights.length !== n) {
    runLayout()
    return
  }
  const heights = [...savedColHeights]
  for (let i = prevCount; i < displayEntries.value.length; i++) {
    const file = displayEntries.value[i]
    const minIdx = heights.indexOf(Math.min(...heights))
    cardPositions[file.path] = { x: minIdx * (cw + GAP), y: heights[minIdx] }
    heights[minIdx] += (cardHeights[file.path] ?? estimatedHeight(file)) + GAP
  }
  savedColHeights       = heights
  containerHeight.value = Math.max(...heights)
}

function cardStyle(file) {
  const pos = cardPositions[file.path]
  if (!pos) return { position: 'absolute', visibility: 'hidden' }
  return {
    position: 'absolute',
    top: '0',
    left: '0',
    width: colWidth.value + 'px',
    transform: `translate(${pos.x}px, ${pos.y}px)`,
  }
}

// ── Entries ──────────────────────────────────────────────────────────────────
watch(() => store.entries, (newEntries) => {
  if (store.page === 1) {
    const keep = new Set(newEntries.map(e => e.path))
    for (const p of Object.keys(cardHeights))   if (!keep.has(p)) delete cardHeights[p]
    for (const p of Object.keys(cardPositions)) if (!keep.has(p)) delete cardPositions[p]
    displayEntries.value = [...newEntries]
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    runLayout()
  } else {
    const prevCount = displayEntries.value.length
    displayEntries.value = [...displayEntries.value, ...newEntries]
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    appendLayout(prevCount)
  }
}, { immediate: true })

watch(colCount, () => {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  runLayout()
})

function loadMore() {
  if (store.loading || displayEntries.value.length >= store.total) return
  store.goToPage(store.page + 1)
}

// ── Observers ────────────────────────────────────────────────────────────────
let scrollObs   = null
let containerRO = null

function updateContainerMetrics(w) {
  if (w === 0) return
  const n  = widthToColCount(w)
  const cw = Math.floor((w - GAP * (n - 1)) / n)
  const colCountChanged = n  !== colCount.value
  const colWidthChanged = cw !== colWidth.value
  colWidth.value = cw
  if (colCountChanged)      colCount.value = n  // watch(colCount) 触发 runLayout
  else if (colWidthChanged) runLayout()          // 列数不变但宽度变了（如侧边栏收起）
}

watch(containerRef, (el, oldEl) => {
  if (!containerRO) return
  if (oldEl) containerRO.unobserve(oldEl)
  if (el) {
    updateContainerMetrics(el.clientWidth)
    containerRO.observe(el)
  }
})

watch(sentinelRef, (el, oldEl) => {
  if (oldEl) scrollObs?.unobserve(oldEl)
  if (el)    scrollObs?.observe(el)
})

function onKeyDown(e) {
  if (!e.ctrlKey && !e.metaKey) return
  const el = document.activeElement
  if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
  if (el?.closest('[role="dialog"]')) return

  switch (e.key) {
    case 'a':
      e.preventDefault()
      store.setSelection([...displayEntries.value])
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
      if (store.writeMode && store.clipboard && !(store.multiRoot && store.currentPath === '')) {
        e.preventDefault()
        store.paste()
      }
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  scrollObs = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore() },
    { rootMargin: '400px' }
  )
  if (sentinelRef.value) scrollObs.observe(sentinelRef.value)

  containerRO = new ResizeObserver(([entry]) => {
    updateContainerMetrics(entry.contentRect.width)
  })
  if (containerRef.value) {
    updateContainerMetrics(containerRef.value.clientWidth)
    containerRO.observe(containerRef.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  if (rafId) cancelAnimationFrame(rafId)
  scrollObs?.disconnect()
  containerRO?.disconnect()
  for (const ro of Object.values(cardROs)) ro.disconnect()
})

// ── Rubber-band selection ─────────────────────────────────────────────────────
const scrollRef = ref(null)

function onRubberSelect(paths) {
  if (!paths.length) { store.clearSelection(); return }
  const pathSet = new Set(paths)
  store.setSelection(displayEntries.value.filter(e => pathSet.has(e.path)))
}

const { isDragging: rbDragging, selRect: rbRect, onMouseDown: rbMouseDown } =
  useRubberBand(scrollRef, onRubberSelect)
</script>

<template>
  <div ref="scrollRef" class="waterfall-scroll pa-3" @contextmenu="onBgContextMenu" @mousedown="rbMouseDown">
    <div v-if="store.loading && displayEntries.length === 0"
         class="d-flex justify-center align-center" style="height:200px">
      <v-progress-circular indeterminate />
    </div>

    <div v-else-if="!store.loading && store.total === 0"
         class="text-center text-grey pa-12">
      <v-icon size="64" class="mb-2">mdi-folder-open-outline</v-icon>
      <div>Empty directory</div>
    </div>

    <template v-else>
      <div ref="containerRef" class="masonry" :style="{ height: containerHeight + 'px' }">
        <div
          v-for="file in displayEntries"
          :key="file.path"
          :ref="el => attachCardRef(el, file.path)"
          :style="cardStyle(file)"
          :data-path="file.path"
        >
          <FileCard
            :file="file"
            @open="emit('open-file', $event)"
            @navigate="store.navigate"
            @context-menu="onCardContextMenu"
          />
        </div>
      </div>

      <div ref="sentinelRef" style="height:1px" />

      <div v-if="store.loading" class="d-flex justify-center pa-4">
        <v-progress-circular indeterminate size="28" width="3" />
      </div>

      <div v-else-if="displayEntries.length >= store.total && store.total > 0"
           class="text-center text-caption text-medium-emphasis pa-3">
        — {{ store.total }} items —
      </div>
    </template>
  </div>

  <!-- Rubber-band selection overlay -->
  <div
    v-if="rbDragging"
    class="rubberband-rect"
    :style="{ left: rbRect.left + 'px', top: rbRect.top + 'px', width: rbRect.width + 'px', height: rbRect.height + 'px' }"
  />

  <!-- Single shared context menu for cards and background -->
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
        <v-text-field v-model="renameName" label="New name" autofocus :error-messages="renameError" @keydown.enter="confirmRename" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="renameDialog = false">Cancel</v-btn>
        <v-btn color="primary" :loading="renameLoading" @click="confirmRename">Rename</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Delete dialog -->
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
        <v-btn color="error" :loading="deleteLoading" @click="confirmDelete">Delete</v-btn>
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
.waterfall-scroll {
  min-height: 100%;
}
.masonry {
  position: relative;
}
.rubberband-rect {
  position: fixed;
  pointer-events: none;
  border: 1px solid rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
  z-index: 999;
}
</style>

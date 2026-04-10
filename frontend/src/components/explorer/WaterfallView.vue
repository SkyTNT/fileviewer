<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import FileCard from './FileCard.vue'

const emit = defineEmits(['open-file'])
const store = useFileStore()

const displayEntries = ref([])
const sentinelRef    = ref(null)
const containerRef   = ref(null)
const colCount       = ref(5)

const columns    = ref([])
const colHeights = []

const cardHeights  = {}  // path → last measured height
const placedHeight = {}  // path → height used when placed
const cardColIdx   = {}  // path → column index
const cardROs      = {}  // path → ResizeObserver

// Cards from the latest page that haven't been re-sorted after image load
const pendingPaths = new Set()
let redistributeTimer = null

function estimatedHeight(file) {
  return file.type === 'image' ? 230 : 110
}

function shortestCol() {
  let min = Infinity, idx = 0
  for (let i = 0; i < colHeights.length; i++) {
    if (colHeights[i] < min) { min = colHeights[i]; idx = i }
  }
  return idx
}

function appendEntries(entries, markPending = false) {
  for (const file of entries) {
    const idx = shortestCol()
    columns.value[idx].push(file)
    const h = cardHeights[file.path] ?? estimatedHeight(file)
    placedHeight[file.path] = h
    cardColIdx[file.path]   = idx
    colHeights[idx] += h + 8
    if (markPending && !(file.path in cardHeights)) {
      pendingPaths.add(file.path)
    }
  }
}

function redistributePending() {
  if (pendingPaths.size === 0) return
  const paths = [...pendingPaths]
  pendingPaths.clear()

  const fileMap = new Map(displayEntries.value.map(f => [f.path, f]))

  // Remove from columns and subtract their placed heights
  for (const path of paths) {
    const col = cardColIdx[path]
    if (col === undefined) continue
    const arr = columns.value[col]
    const i = arr.findIndex(f => f.path === path)
    if (i !== -1) arr.splice(i, 1)
    colHeights[col] -= (placedHeight[path] ?? 0) + 8
    delete placedHeight[path]
    delete cardColIdx[path]
  }

  // Re-append in original order using actual measured heights.
  // Pass markPending=true so cards whose images still haven't loaded stay pending.
  const files = paths
    .map(p => fileMap.get(p))
    .filter(Boolean)
    .sort((a, b) => displayEntries.value.indexOf(a) - displayEntries.value.indexOf(b))
  appendEntries(files, true)
}

function schedulePendingRedistribute() {
  clearTimeout(redistributeTimer)
  redistributeTimer = setTimeout(redistributePending, 100)
}

function fullRebuild(markPending = false) {
  clearTimeout(redistributeTimer)
  pendingPaths.clear()
  const n = colCount.value
  columns.value = Array.from({ length: n }, () => [])
  colHeights.length = 0
  for (let i = 0; i < n; i++) colHeights.push(0)
  for (const k in placedHeight) delete placedHeight[k]
  for (const k in cardColIdx)   delete cardColIdx[k]
  appendEntries(displayEntries.value, markPending)
}

function attachCardRef(el, path) {
  if (el) {
    if (!cardROs[path]) {
      const ro = new ResizeObserver(() => {
        const h = el.offsetHeight
        if (cardHeights[path] === h) return
        cardHeights[path] = h
        if (pendingPaths.has(path)) {
          // Image loaded for a new-page card — schedule redistribution
          schedulePendingRedistribute()
        } else {
          // Stable card: just adjust column height in place
          const col = cardColIdx[path]
          if (col !== undefined) {
            colHeights[col] += h - (placedHeight[path] ?? 0)
            placedHeight[path] = h
          }
        }
      })
      ro.observe(el)
      cardROs[path] = ro
    }
  } else {
    cardROs[path]?.disconnect()
    delete cardROs[path]
  }
}

watch(() => store.entries, (newEntries) => {
  if (store.page === 1) {
    const newPaths = new Set(newEntries.map(e => e.path))
    Object.keys(cardHeights).forEach(k => { if (!newPaths.has(k)) delete cardHeights[k] })
    displayEntries.value = [...newEntries]
    fullRebuild(true)
  } else {
    displayEntries.value = [...displayEntries.value, ...newEntries]
    appendEntries(newEntries, true)
  }
}, { immediate: true })

watch(colCount, () => fullRebuild())

function loadMore() {
  if (store.loading || displayEntries.value.length >= store.total) return
  store.goToPage(store.page + 1)
}

let scrollObs   = null
let containerRO = null

watch(sentinelRef, (el, oldEl) => {
  if (oldEl) scrollObs?.unobserve(oldEl)
  if (el)    scrollObs?.observe(el)
})

onMounted(() => {
  scrollObs = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore() },
    { rootMargin: '400px' }
  )
  if (sentinelRef.value) scrollObs.observe(sentinelRef.value)

  containerRO = new ResizeObserver(([entry]) => {
    const w = entry.contentRect.width
    colCount.value = w < 480 ? 2 : w < 720 ? 3 : w < 960 ? 4 : w < 1280 ? 5 : 6
  })
  if (containerRef.value) containerRO.observe(containerRef.value)
})

onUnmounted(() => {
  clearTimeout(redistributeTimer)
  scrollObs?.disconnect()
  containerRO?.disconnect()
  Object.values(cardROs).forEach(ro => ro.disconnect())
})
</script>

<template>
  <div class="waterfall-scroll pa-3">
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
      <div ref="containerRef" class="masonry">
        <div v-for="(col, i) in columns" :key="i" class="masonry-col">
          <div
            v-for="file in col"
            :key="file.path"
            :ref="el => attachCardRef(el, file.path)"
          >
            <FileCard
              :file="file"
              @open="emit('open-file', $event)"
              @navigate="store.navigate"
            />
          </div>
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
</template>

<style scoped>
.waterfall-scroll {
  height: 100%;
  overflow-y: auto;
}
.masonry {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.masonry-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>

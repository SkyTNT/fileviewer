<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import FileCard from './FileCard.vue'

const emit = defineEmits(['open-file'])
const store = useFileStore()

const displayEntries = ref([])
const sentinelRef    = ref(null)
const containerRef   = ref(null)

function widthToColCount(w) {
  return w < 300 ? 1 : w < 480 ? 2 : w < 720 ? 3 : w < 960 ? 4 : w < 1280 ? 5 : 6
}

const colCount = ref(widthToColCount(window.innerWidth))

function estimatedHeight(file) {
  return file.type === 'image' ? 220 : 150
}

// ── Height tracking ──────────────────────────────────────────────────────────
// Plain object (non-reactive) so individual card measurements don't cascade.
// layoutVersion is the single reactive trigger that batches all updates.
const cardHeights = {}
const cardROs     = {}
const layoutVersion = ref(0)
let rafId = null

function scheduleLayout() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => { rafId = null; layoutVersion.value++ })
}

// Called by each card wrapper's :ref. On null we keep cardHeights intact to
// avoid a redistribution loop (stale estimate → card moves → remount → repeat).
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

// ── Column distribution ──────────────────────────────────────────────────────
// Recomputes only when entries, colCount, or the batched height version changes.
const columns = computed(() => {
  layoutVersion.value          // batched height updates
  const n   = colCount.value
  const cols    = Array.from({ length: n }, () => [])
  const heights = new Array(n).fill(0)
  for (const file of displayEntries.value) {
    const minIdx = heights.indexOf(Math.min(...heights))
    cols[minIdx].push(file)
    heights[minIdx] += (cardHeights[file.path] ?? estimatedHeight(file)) + 8
  }
  return cols
})

// ── Entries ──────────────────────────────────────────────────────────────────
watch(() => store.entries, (newEntries) => {
  if (store.page === 1) {
    // Evict heights for paths no longer present
    const keep = new Set(newEntries.map(e => e.path))
    for (const p of Object.keys(cardHeights)) if (!keep.has(p)) delete cardHeights[p]
    displayEntries.value = [...newEntries]
  } else {
    displayEntries.value = [...displayEntries.value, ...newEntries]
  }
}, { immediate: true })

function loadMore() {
  if (store.loading || displayEntries.value.length >= store.total) return
  store.goToPage(store.page + 1)
}

// ── Observers ────────────────────────────────────────────────────────────────
let scrollObs   = null
let containerRO = null

// Re-bind when masonry mounts/unmounts during navigation loading state
watch(containerRef, (el, oldEl) => {
  if (!containerRO) return
  if (oldEl) containerRO.unobserve(oldEl)
  if (el) {
    const w = el.clientWidth
    if (w > 0) colCount.value = widthToColCount(w)
    containerRO.observe(el)
  }
})

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
    if (w === 0) return
    const next = widthToColCount(w)
    if (next !== colCount.value) colCount.value = next
  })
  if (containerRef.value) {
    const w = containerRef.value.clientWidth
    if (w > 0) colCount.value = widthToColCount(w)
    containerRO.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  scrollObs?.disconnect()
  containerRO?.disconnect()
  for (const ro of Object.values(cardROs)) ro.disconnect()
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

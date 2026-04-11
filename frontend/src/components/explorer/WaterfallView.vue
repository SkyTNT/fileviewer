<script setup>
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import FileCard from './FileCard.vue'

const emit = defineEmits(['open-file'])
const store = useFileStore()

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

onMounted(() => {
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
      <div ref="containerRef" class="masonry" :style="{ height: containerHeight + 'px' }">
        <div
          v-for="file in displayEntries"
          :key="file.path"
          :ref="el => attachCardRef(el, file.path)"
          :style="cardStyle(file)"
        >
          <FileCard
            :file="file"
            @open="emit('open-file', $event)"
            @navigate="store.navigate"
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
</template>

<style scoped>
.masonry {
  position: relative;
}
</style>

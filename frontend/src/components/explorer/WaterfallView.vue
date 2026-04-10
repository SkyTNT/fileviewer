<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import FileCard from './FileCard.vue'

const emit = defineEmits(['open-file'])
const store = useFileStore()

const displayEntries = ref([])
const sentinelRef    = ref(null)
const containerRef   = ref(null)
const colCount       = ref(5)

const cardHeights = reactive({}) // path → actual rendered px height
const cardROs     = {}           // path → ResizeObserver

function estimatedHeight(file) {
  return file.type === 'image' ? 230 : 110
}

// Reactively redistribute entries into columns using shortest-column algorithm.
// cardHeights is reactive, so this recomputes whenever any height changes.
const columns = computed(() => {
  const n = colCount.value
  const cols = Array.from({ length: n }, () => [])
  const heights = new Array(n).fill(0)
  for (const file of displayEntries.value) {
    const minCol = heights.indexOf(Math.min(...heights))
    cols[minCol].push(file)
    heights[minCol] += (cardHeights[file.path] ?? estimatedHeight(file)) + 8
  }
  return cols
})

// Template ref callback for each card wrapper div.
// When a card is redistributed to a new column, Vue destroys the old element
// (el = null) and creates a new one (el = element). We reconnect the observer
// on the new element. We do NOT delete cardHeights on null to prevent a
// distribution loop (height gone → recompute with estimate → move back → repeat).
function attachCardRef(el, path) {
  if (el) {
    if (!cardROs[path]) {
      const ro = new ResizeObserver(() => {
        const h = el.offsetHeight
        if (cardHeights[path] !== h) {
          cardHeights[path] = h
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
    // Directory changed — clear heights that are no longer relevant
    const newPaths = new Set(newEntries.map(e => e.path))
    Object.keys(cardHeights).forEach(k => { if (!newPaths.has(k)) delete cardHeights[k] })
    displayEntries.value = [...newEntries]
  } else {
    displayEntries.value = [...displayEntries.value, ...newEntries]
  }
}, { immediate: true })

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

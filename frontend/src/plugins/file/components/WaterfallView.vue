<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileStore } from '@/plugins/file/store.js'
import { useRubberBand } from '../useRubberBand.js'
import { useContextMenu } from '../useContextMenu.js'
import { useExplorerKeyboard } from '../useExplorerKeyboard.js'
import { filesApi } from '@/services/api.js'
import FileCard from './FileCard.vue'
import ContextMenu from './ContextMenu.vue'

const store = useFileStore()
const { t } = useI18n()

const displayEntries = ref([])

const { menuOpen, menuX, menuY, showMenu, onBgContextMenu } = useContextMenu()

async function refreshAll() {
  const path   = store.currentPath
  const pages  = store.page
  const size   = store.pageSize
  const filter = store.filterPattern || null
  store.loading = true
  try {
    const all = []
    let newTotal = store.total
    for (let p = 1; p <= pages; p++) {
      const res = await filesApi.listDirectory(path, p, size, filter, store.sortBy, store.sortOrder)
      all.push(...res.data.entries)
      newTotal = res.data.total
    }
    store.total = newTotal
    const keep = new Set(all.map(e => e.path))
    for (const k of Object.keys(cardPositions)) if (!keep.has(k)) delete cardPositions[k]
    displayEntries.value = [...all]
    runLayout()
  } catch { /* ignore */ }
  finally { store.loading = false }
}

useExplorerKeyboard(displayEntries)

function onCardContextMenu({ file, x, y }) {
  showMenu(x, y, file)
}

const sentinelRef  = ref(null)
const containerRef = ref(null)

const GAP = 8

function widthToColCount(w) {
  return w < 300 ? 1 : w < 480 ? 2 : w < 720 ? 3 : w < 960 ? 4 : w < 1280 ? 5 : 6
}

const colCount = ref(widthToColCount(window.innerWidth))
const colWidth  = ref(0)

// ── Zoom scaling ─────────────────────────────────────────────────────────────
// Layout is computed once at initial container width and never re-run on resize.
// All subsequent width changes (sidebar, window) are handled by CSS scale alone.
const containerActualWidth = ref(0)
const layoutComputedWidth  = ref(0)

const zoomScale = computed(() =>
  layoutComputedWidth.value ? containerActualWidth.value / layoutComputedWidth.value : 1
)

const masonryStyle = computed(() => ({
  width: layoutComputedWidth.value ? layoutComputedWidth.value + 'px' : undefined,
  height: containerHeight.value + 'px',
  transform: zoomScale.value !== 1 ? `scale(${zoomScale.value})` : undefined,
}))

const masonryOuterStyle = computed(() => ({
  height: containerHeight.value * zoomScale.value + 'px',
}))

// Scroll position drifts when total height changes due to zoom; correct it.
// Setting `zoomingTim` indicates that zooming is in progress, which is used to prevent `onScrollOrResize` later.
let zoomingTim = null
watch(zoomScale, async (newZoom, oldZoom) => {
  if (!oldZoom || newZoom === oldZoom) return
  if (zoomingTim)
    clearTimeout(zoomingTim)
  zoomingTim = setTimeout(() => zoomingTim = null, 100)
  const prevY = window.scrollY
  window.scrollTo(0, Math.round(prevY * (newZoom / oldZoom)))
})

// ── Static height calculation ────────────────────────────────────────────────
// Heights are fully determined by backend-supplied img_w/img_h + fixed CSS.
// No ResizeObserver needed — layout never changes after initial computation.
const CARD_TEXT_HEIGHT = 56   // v-card-text py-2(8+8) + body-2 line + caption line
const CARD_ICON_HEIGHT = 111  // .icon-area CSS(110) + v-divider(1)
const CARD_FALLBACK_HEIGHT = CARD_ICON_HEIGHT + CARD_TEXT_HEIGHT  // 167

function cardHeight(file) {
  if (file.img_w && file.img_h && colWidth.value) {
    return Math.round(colWidth.value * file.img_h / file.img_w) + CARD_TEXT_HEIGHT
  }
  return CARD_FALLBACK_HEIGHT
}

// ── Absolute position layout ─────────────────────────────────────────────────
const cardPositions = {}
const layoutVersion = ref(0)
const containerHeight = ref(0)
let savedColHeights = []

function runLayout(startIndex = 0) {
  const n  = colCount.value
  const cw = colWidth.value
  if (cw === 0) return
  const canAppend = startIndex > 0 && savedColHeights.length === n

  const heights = canAppend? [...savedColHeights] : new Array(n).fill(0)
  const entries = displayEntries.value
  for (let i = canAppend ? startIndex : 0; i < entries.length; i++) {
    const file = entries[i]
    let minIdx = 0
    for (let j = 1; j < n; j++) if (heights[j] < heights[minIdx]) minIdx = j
    cardPositions[file.path] = { x: minIdx * (cw + GAP), y: heights[minIdx] }
    heights[minIdx] += cardHeight(file) + GAP
  }
  savedColHeights       = heights
  containerHeight.value = heights.length ? Math.max(...heights) : 0
  layoutVersion.value++
}

function cardStyle(file) {
  layoutVersion.value  // subscribe
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

// ── Viewport culling (virtualization) ────────────────────────────────────────
const viewportTop    = ref(0)
const viewportBottom = ref(typeof window !== 'undefined' ? window.innerHeight : 0)
const BUFFER_PX = 800

function updateViewport() {
  const el = containerRef.value
  if (!el) return
  const rect  = el.getBoundingClientRect()
  const scale = zoomScale.value || 1
  viewportTop.value    = (-rect.top) / scale
  viewportBottom.value = (window.innerHeight - rect.top) / scale
}

const visibleEntries = computed(() => {
  layoutVersion.value  // subscribe
  const top    = viewportTop.value    - BUFFER_PX
  const bottom = viewportBottom.value + BUFFER_PX
  const out = []
  const entries = displayEntries.value
  for (let i = 0; i < entries.length; i++) {
    const file = entries[i]
    const pos  = cardPositions[file.path]
    if (!pos) continue
    const h = cardHeight(file)
    if (pos.y + h < top || pos.y > bottom) continue
    out.push(file)
  }
  return out
})

let scrollRaf = null
function onScrollOrResize() {
  savedScrollY = window.scrollY
  if (scrollRaf || zoomingTim) return
  scrollRaf = requestAnimationFrame(() => { scrollRaf = null; updateViewport() })
}

// ── Entries ──────────────────────────────────────────────────────────────────
watch(() => store.entries, (newEntries) => {
  if (store.page === 1) {
    const keep = new Set(newEntries.map(e => e.path))
    for (const p of Object.keys(cardPositions)) if (!keep.has(p)) delete cardPositions[p]
    displayEntries.value = [...newEntries]
    runLayout()
  } else {
    const prevCount = displayEntries.value.length
    displayEntries.value = [...displayEntries.value, ...newEntries]
    runLayout(prevCount)
  }
}, { immediate: true })

watch([containerHeight, layoutVersion], () => updateViewport())

function loadMore() {
  if (store.loading || displayEntries.value.length >= store.total) return
  store.goToPage(store.page + 1)
}

// ── Observers ────────────────────────────────────────────────────────────────
let scrollObs   = null
let containerRO = null

function updateContainerMetrics(w) {
  if (w === 0) return
  containerActualWidth.value = w
  if (layoutComputedWidth.value) return  // already laid out; zoom handles the rest
  layoutComputedWidth.value = w
  const n = widthToColCount(w)
  colWidth.value = Math.floor((w - GAP * (n - 1)) / n)
  colCount.value = n
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

let savedScrollY = 0

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

onActivated(() => {
  store.setRefreshHook(refreshAll)
  window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
  window.addEventListener('resize', onScrollOrResize, { passive: true })
  nextTick(() => {
    window.scrollTo(0, savedScrollY)
    updateViewport()
  })
})

onDeactivated(() => {
  store.setRefreshHook(null)
  window.removeEventListener('scroll', onScrollOrResize, { capture: true })
  window.removeEventListener('resize', onScrollOrResize)
})

onUnmounted(() => {
  store.setRefreshHook(null)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  scrollObs?.disconnect()
  containerRO?.disconnect()
  window.removeEventListener('scroll', onScrollOrResize, { capture: true })
  window.removeEventListener('resize', onScrollOrResize)
})

// ── Rubber-band selection ─────────────────────────────────────────────────────
const scrollRef = ref(null)

function onRubberSelect(paths, ctrlHeld) {
  if (!paths.length) { if (!ctrlHeld) store.clearSelection(); return }
  const pathSet = new Set(paths)
  const items = displayEntries.value.filter(e => pathSet.has(e.path))
  if (ctrlHeld) store.addToSelection(items)
  else          store.setSelection(items)
}

function onCardSelect({ file, event }) {
  if (event.shiftKey)                      store.shiftSelectTo(file, displayEntries.value)
  else if (event.ctrlKey || event.metaKey) store.toggleEntry(file)
  else                                     store.selectEntry(file)
}

function rubberHitTest(sr) {
  const cont = containerRef.value
  if (!cont) return []
  const rect  = cont.getBoundingClientRect()
  const scale = zoomScale.value || 1
  const cw    = colWidth.value * scale
  const out   = []
  const entries = displayEntries.value
  for (let i = 0; i < entries.length; i++) {
    const file = entries[i]
    const pos  = cardPositions[file.path]
    if (!pos) continue
    const left = rect.left + pos.x * scale
    const top  = rect.top  + pos.y * scale
    if (left + cw >= sr.left && left <= sr.right &&
        top + cardHeight(file) * scale >= sr.top && top <= sr.bottom) {
      out.push(file.path)
    }
  }
  return out
}

const { isDragging: rbDragging, selRect: rbRect, onMouseDown: rbMouseDown } =
  useRubberBand(scrollRef, onRubberSelect, rubberHitTest)
</script>

<template>
  <div ref="scrollRef" class="waterfall-scroll pa-3" @contextmenu="onBgContextMenu" @mousedown="rbMouseDown">
    <div v-if="store.total === 0 && !store.loading"
         class="text-center text-grey pa-12">
      <v-icon size="64" class="mb-2">mdi-folder-open-outline</v-icon>
      <div>{{ t('explorer.emptyDirectory') }}</div>
    </div>

    <template v-else>
      <div ref="containerRef" class="masonry-outer" :style="masonryOuterStyle">
        <div class="masonry" :style="masonryStyle">
          <div
            v-for="file in visibleEntries"
            :key="file.path"
            :data-path="file.path"
            :style="cardStyle(file)"
          >
            <FileCard
              :file="file"
              @context-menu="onCardContextMenu"
              @select="onCardSelect"
            />
          </div>
        </div>
      </div>

      <div ref="sentinelRef" style="height:1px" />

      <div v-if="displayEntries.length >= store.total && store.total > 0"
           class="text-center text-caption text-medium-emphasis pa-3">
        {{ t('explorer.totalItems', { n: store.total }) }}
      </div>
    </template>
  </div>

  <div
    v-if="rbDragging"
    class="rubberband-rect"
    :style="{ left: rbRect.left + 'px', top: rbRect.top + 'px', width: rbRect.width + 'px', height: rbRect.height + 'px' }"
  />

  <ContextMenu v-model="menuOpen" :x="menuX" :y="menuY" />
</template>

<style scoped>
.waterfall-scroll {
  min-height: 100%;
}
.masonry-outer {
  position: relative;
  overflow: visible;
}
.masonry {
  position: relative;
  transform-origin: top left;
  will-change: transform;
}
.rubberband-rect {
  position: fixed;
  pointer-events: none;
  border: 1px solid rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
  z-index: 999;
}
</style>

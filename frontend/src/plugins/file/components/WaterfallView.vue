<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
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
    for (const k of Object.keys(cardHeights))   if (!keep.has(k)) delete cardHeights[k]
    for (const k of Object.keys(cardPositions)) if (!keep.has(k)) delete cardPositions[k]
    store.displayEntries = [...all]
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    runLayout()
  } catch { /* ignore */ }
  finally { store.loading = false }
}

useExplorerKeyboard()

function onCardContextMenu({ file, x, y }) {
  showMenu(x, y, file)
}

const sentinelRef = ref(null)
const containerRef   = ref(null)

const GAP = 8

function widthToColCount(w) {
  return w < 300 ? 1 : w < 480 ? 2 : w < 720 ? 3 : w < 960 ? 4 : w < 1280 ? 5 : 6
}

const colCount = ref(widthToColCount(window.innerWidth))
const colWidth  = ref(0)

// ── Zoom scaling (detail sidebar open) ──────────────────────────────────────
// When the right detail panel opens and narrows the container, we scale the
// already-computed layout down with CSS zoom instead of re-running runLayout,
// so card positions stay stable.
const containerActualWidth = ref(0)  // current measured container width
const layoutComputedWidth  = ref(0)  // container width when layout last ran

const zoomScale = computed(() => {
  if (!layoutComputedWidth.value) return 1
  const ratio = containerActualWidth.value / layoutComputedWidth.value
  return Math.min(ratio, 1)  // never zoom in beyond 1 (wider → recompute instead)
})

// transform: scale is GPU-composited (no repaint per frame, unlike CSS zoom)
const masonryStyle = computed(() => ({
  width: layoutComputedWidth.value ? layoutComputedWidth.value + 'px' : undefined,
  height: containerHeight.value + 'px',
  transform: zoomScale.value !== 1 ? `scale(${zoomScale.value})` : undefined,
}))

// Outer wrapper carries the visual height so the scroll container is correct
const masonryOuterStyle = computed(() => ({
  height: containerHeight.value * zoomScale.value + 'px',
}))

// ── Scroll position preservation during zoom ─────────────────────────────────
// When zoom changes, total scroll height changes proportionally. Without
// correction, the viewport drifts away from the content the user was viewing.
// Fix: capture scrollY before DOM update, restore proportionally after.
watch(zoomScale, async (newZoom, oldZoom) => {
  if (!oldZoom || newZoom === oldZoom) return
  const prevY = window.scrollY
  await nextTick()
  window.scrollTo(0, Math.round(prevY * (newZoom / oldZoom)))
})

function estimatedHeight(file) {
  return file.type === 'image' ? 220 : 150
}

// ── Height tracking ──────────────────────────────────────────────────────────
// Single shared ResizeObserver across all cards; unobserve when a card leaves
// the DOM (virtualization makes this a frequent operation).
const cardHeights = {}
const cardEls     = {}
let sharedRO = null

function attachCardRef(el, path) {
  if (el) {
    cardEls[path] = el
    sharedRO?.observe(el)
  } else {
    const old = cardEls[path]
    if (old) { sharedRO?.unobserve(old); delete cardEls[path] }
  }
}

// ── Absolute position layout ─────────────────────────────────────────────────
// cardPositions is a plain object (not reactive) to avoid per-key reactive
// overhead at 10k+ items. Reactivity is funneled through layoutVersion — any
// template/computed that reads it will re-run when layout changes.
const cardPositions = {}        // path → { x, y }
const layoutVersion = ref(0)
const containerHeight = ref(0)
let savedColHeights   = []
let rafId = null

function runLayout() {
  const n  = colCount.value
  const cw = colWidth.value
  if (cw === 0) return
  const heights = new Array(n).fill(0)
  const entries = store.displayEntries
  for (let i = 0; i < entries.length; i++) {
    const file = entries[i]
    let minIdx = 0
    for (let j = 1; j < n; j++) if (heights[j] < heights[minIdx]) minIdx = j
    cardPositions[file.path] = { x: minIdx * (cw + GAP), y: heights[minIdx] }
    heights[minIdx] += (cardHeights[file.path] ?? estimatedHeight(file)) + GAP
  }
  savedColHeights       = heights
  containerHeight.value = heights.length ? Math.max(...heights) : 0
  layoutVersion.value++
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
  const entries = store.displayEntries
  for (let i = prevCount; i < entries.length; i++) {
    const file = entries[i]
    let minIdx = 0
    for (let j = 1; j < n; j++) if (heights[j] < heights[minIdx]) minIdx = j
    cardPositions[file.path] = { x: minIdx * (cw + GAP), y: heights[minIdx] }
    heights[minIdx] += (cardHeights[file.path] ?? estimatedHeight(file)) + GAP
  }
  savedColHeights       = heights
  containerHeight.value = Math.max(...heights)
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
// Only render cards whose (y, y+h) intersects the viewport ± BUFFER_PX. This
// lets 10k+ items stay in store.displayEntries while keeping DOM card count to
// a few dozen (= visible area / card height).
const viewportTop    = ref(0)
const viewportBottom = ref(typeof window !== 'undefined' ? window.innerHeight : 0)
const BUFFER_PX = 800

function updateViewport() {
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const scale = zoomScale.value || 1
  // Convert from viewport (client) coords to container-local unscaled coords.
  viewportTop.value    = (-rect.top) / scale
  viewportBottom.value = (window.innerHeight - rect.top) / scale
}

const visibleEntries = computed(() => {
  layoutVersion.value  // subscribe
  const top    = viewportTop.value    - BUFFER_PX
  const bottom = viewportBottom.value + BUFFER_PX
  const out = []
  const entries = store.displayEntries
  for (let i = 0; i < entries.length; i++) {
    const file = entries[i]
    const pos  = cardPositions[file.path]
    if (!pos) continue
    const h = cardHeights[file.path] ?? estimatedHeight(file)
    if (pos.y + h < top || pos.y > bottom) continue
    out.push(file)
  }
  return out
})

let scrollRaf = null
function onScrollOrResize() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null
    updateViewport()
  })
}

// ── Entries ──────────────────────────────────────────────────────────────────
watch(() => store.entries, (newEntries) => {
  if (store.page === 1) {
    const keep = new Set(newEntries.map(e => e.path))
    for (const p of Object.keys(cardHeights))   if (!keep.has(p)) delete cardHeights[p]
    for (const p of Object.keys(cardPositions)) if (!keep.has(p)) delete cardPositions[p]
    store.displayEntries = [...newEntries]
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    runLayout()
  } else {
    const prevCount = store.displayEntries.length
    if (prevCount === 0) {
      // Mounted while store.page > 1 (e.g. switched from ListView on a non-first page).
      // displayEntries is empty so we can't append — reset to page 1 instead.
      store.loadDirectory(store.currentPath)
      return
    }
    store.displayEntries = [...store.displayEntries, ...newEntries]
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    appendLayout(prevCount)
  }
}, { immediate: true })

watch(colCount, () => {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  runLayout()
})

// Layout changes can shift containerRef in the viewport; keep cull window fresh.
watch([containerHeight, layoutVersion], () => updateViewport())

function loadMore() {
  if (store.loading || store.displayEntries.length >= store.total) return
  store.goToPage(store.page + 1)
}

// ── Observers ────────────────────────────────────────────────────────────────
let scrollObs   = null
let containerRO = null

function updateContainerMetrics(w) {
  if (w === 0) return
  containerActualWidth.value = w
  if (!layoutComputedWidth.value || w > layoutComputedWidth.value) {
    // 首次布局 或 容器变宽（侧边栏关闭/窗口放大）→ 重新计算
    // layoutComputedWidth 只在这里更新，runLayout 不碰它（防止 scheduleLayout 意外重置 zoom 基准）
    layoutComputedWidth.value = w
    const n = widthToColCount(w)
    colWidth.value = Math.floor((w - GAP * (n - 1)) / n)
    if (n !== colCount.value) colCount.value = n  // watch(colCount) → runLayout
    else runLayout()
  }
  // else: 容器变窄（如右侧详情面板打开）→ CSS scale 处理，colCount/colWidth/positions 全部不动
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
  store.setRefreshHook(refreshAll)

  scrollObs = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore() },
    { rootMargin: '400px' }
  )
  if (sentinelRef.value) scrollObs.observe(sentinelRef.value)

  containerRO = new ResizeObserver(([entry]) => {
    updateContainerMetrics(entry.contentRect.width)
    updateViewport()
  })
  if (containerRef.value) {
    updateContainerMetrics(containerRef.value.clientWidth)
    containerRO.observe(containerRef.value)
  }

  // Shared ResizeObserver for all rendered cards — replaces 1 RO per card.
  sharedRO = new ResizeObserver(entries => {
    let changed = false
    for (const entry of entries) {
      const el = entry.target
      const path = el.dataset.path
      if (!path) continue
      const h = el.offsetHeight
      if (h && cardHeights[path] !== h) {
        cardHeights[path] = h
        changed = true
      }
    }
    if (changed) scheduleLayout()
  })
  // Cards mounted before sharedRO was created (template runs before onMounted).
  for (const el of Object.values(cardEls)) sharedRO.observe(el)

  // Capture-phase listener catches scroll on any ancestor (window, v-main, …).
  window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
  window.addEventListener('resize', onScrollOrResize, { passive: true })
  updateViewport()
})

onUnmounted(() => {
  store.setRefreshHook(null)
  if (rafId) cancelAnimationFrame(rafId)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  scrollObs?.disconnect()
  containerRO?.disconnect()
  sharedRO?.disconnect()
  window.removeEventListener('scroll', onScrollOrResize, { capture: true })
  window.removeEventListener('resize', onScrollOrResize)
})

// ── Rubber-band selection ─────────────────────────────────────────────────────
const scrollRef = ref(null)

function onRubberSelect(paths, ctrlHeld) {
  if (!paths.length) { if (!ctrlHeld) store.clearSelection(); return }
  const pathSet = new Set(paths)
  const items = store.displayEntries.filter(e => pathSet.has(e.path))
  if (ctrlHeld) store.addToSelection(items)
  else          store.setSelection(items)
}

function onCardSelect({ file, event }) {
  if (event.shiftKey)                   store.shiftSelectTo(file, store.displayEntries)
  else if (event.ctrlKey || event.metaKey) store.toggleEntry(file)
  else                                  store.selectEntry(file)
}

// Virtualization-aware hit-test: DOM only holds visible cards, so a
// rubber-band using querySelectorAll would miss off-screen items. Here we
// intersect the drag rect against every entry's stored position instead.
function rubberHitTest(sr) {
  const cont = containerRef.value
  if (!cont) return []
  const rect = cont.getBoundingClientRect()
  const scale = zoomScale.value || 1
  const cw = colWidth.value * scale
  const out = []
  const entries = store.displayEntries
  for (let i = 0; i < entries.length; i++) {
    const file = entries[i]
    const pos  = cardPositions[file.path]
    if (!pos) continue
    const h = (cardHeights[file.path] ?? estimatedHeight(file)) * scale
    const left   = rect.left + pos.x * scale
    const top    = rect.top  + pos.y * scale
    if (left + cw >= sr.left && left <= sr.right &&
        top  + h  >= sr.top  && top  <= sr.bottom) {
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
            :ref="el => attachCardRef(el, file.path)"
            :style="cardStyle(file)"
            :data-path="file.path"
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

      <div v-if="store.displayEntries.length >= store.total && store.total > 0"
           class="text-center text-caption text-medium-emphasis pa-3">
        {{ t('explorer.totalItems', { n: store.total }) }}
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

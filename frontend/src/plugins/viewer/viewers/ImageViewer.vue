<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { imagesApi } from '@/services/api.js'
import { useFileStore } from '@/plugins/file/store.js'
import { useKeyboard } from '@/plugins/keyboard/useKeyboard.js'

const { t } = useI18n()
const fileStore = useFileStore()

const dialog      = ref(false)
const imgUrl      = ref('')
const fileName    = ref('')
const currentFile = ref(null)
const imgLoaded   = ref(false)
const dragMode    = ref(false)

const transform = reactive({ scale: 1, x: 0, y: 0 })
const dragging  = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
let fitScale = 1

function open(file) {
  currentFile.value = file
  imgUrl.value      = imagesApi.fullUrl(file.path)
  fileName.value    = file.name
  imgLoaded.value   = false
  dragMode.value    = false
  fitScale = 1
  transform.scale = 1; transform.x = 0; transform.y = 0
  dialog.value = true
}

// ── Adjacent-image navigation ─────────────────────────────────────────────────

const imageEntries = computed(() => fileStore.entries.filter(f => f.type === 'image'))

const currentIndex = computed(() =>
  imageEntries.value.findIndex(f => f.path === currentFile.value?.path)
)

const prevImage = computed(() =>
  currentIndex.value > 0 ? imageEntries.value[currentIndex.value - 1] : null
)
const nextImage = computed(() =>
  currentIndex.value >= 0 && currentIndex.value < imageEntries.value.length - 1
    ? imageEntries.value[currentIndex.value + 1]
    : null
)

function navigatePrev() { if (prevImage.value) open(prevImage.value) }
function navigateNext() { if (nextImage.value) open(nextImage.value) }

useKeyboard({
  'ArrowLeft':  (e) => {
    if (!dialog.value) return false
    e.preventDefault()
    navigatePrev()
  },
  'ArrowRight': (e) => {
    if (!dialog.value) return false
    e.preventDefault()
    navigateNext()
  },
}, { priority: 10, inDialog: true })

// ── Pan & zoom ────────────────────────────────────────────────────────────────

function onImgLoad(e) {
  const { naturalWidth: iw, naturalHeight: ih } = e.target
  if (iw && ih) {
    fitScale = Math.min(window.innerWidth / iw, window.innerHeight / ih)
    transform.scale = fitScale
    transform.x = 0; transform.y = 0
  }
  imgLoaded.value = true
}

function reset() {
  transform.scale = fitScale; transform.x = 0; transform.y = 0
}

function onWheel(e) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.12 : 0.89
  const newScale = Math.max(0.05, Math.min(20, transform.scale * factor))
  const ratio = newScale / transform.scale
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  transform.x = e.clientX - cx - (e.clientX - cx - transform.x) * ratio
  transform.y = e.clientY - cy - (e.clientY - cy - transform.y) * ratio
  transform.scale = newScale
}

function onMouseDown(e) {
  if (dragMode.value || e.button !== 0) return
  dragging.value = true
  dragStart.x = e.clientX - transform.x
  dragStart.y = e.clientY - transform.y
}

function onMouseMove(e) {
  if (!dragging.value) return
  transform.x = e.clientX - dragStart.x
  transform.y = e.clientY - dragStart.y
}

function onMouseUp() { dragging.value = false }

function onDblClick() { if (!dragMode.value) reset() }

// ── Touch (single-finger pan + inertia + two-finger pinch-to-zoom) ───────────

let pinchDist0 = 0, pinchScale0 = 1, pinchMidX = 0, pinchMidY = 0
let velX = 0, velY = 0, rafId = null
const lastPts = []
const FRICTION = 0.95

function touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function stopInertia() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
}

function startInertia() {
  stopInertia()
  const tick = () => {
    velX *= FRICTION; velY *= FRICTION
    if (Math.abs(velX) < 0.5 && Math.abs(velY) < 0.5) { rafId = null; return }
    transform.x += velX; transform.y += velY
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

function onTouchStart(e) {
  stopInertia()
  lastPts.length = 0
  if (e.touches.length === 1) {
    dragging.value = true
    dragStart.x = e.touches[0].clientX - transform.x
    dragStart.y = e.touches[0].clientY - transform.y
  } else if (e.touches.length === 2) {
    dragging.value = false
    velX = 0; velY = 0
    pinchDist0  = touchDist(e.touches)
    pinchScale0 = transform.scale
    pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2
    pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2
  }
}

function onTouchMove(e) {
  if (e.touches.length === 2) {
    const newScale = Math.max(0.05, Math.min(20, pinchScale0 * touchDist(e.touches) / pinchDist0))
    const ratio = newScale / transform.scale
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2
    transform.x = pinchMidX - cx - (pinchMidX - cx - transform.x) * ratio
    transform.y = pinchMidY - cy - (pinchMidY - cy - transform.y) * ratio
    transform.scale = newScale
    return
  }
  if (!dragging.value) return
  const t = e.touches[0]
  transform.x = t.clientX - dragStart.x
  transform.y = t.clientY - dragStart.y
  lastPts.push({ x: t.clientX, y: t.clientY, t: performance.now() })
  if (lastPts.length > 10) lastPts.shift()
}

function onTouchEnd() {
  dragging.value = false
  const now = performance.now()
  const recent = lastPts.filter(p => now - p.t < 80)
  if (recent.length >= 2) {
    const dt = recent[recent.length - 1].t - recent[0].t
    if (dt > 0) {
      velX = (recent[recent.length - 1].x - recent[0].x) / dt * 16
      velY = (recent[recent.length - 1].y - recent[0].y) / dt * 16
      startInertia(); return
    }
  }
  velX = 0; velY = 0
}

defineExpose({ open })
</script>

<template>
  <v-dialog v-model="dialog" fullscreen :scrim="false">
    <div
      class="viewer-bg"
      @wheel.prevent="onWheel"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @touchstart="onTouchStart"
      @touchmove.prevent="onTouchMove"
      @touchend="onTouchEnd"
      @dblclick="onDblClick"
    >
      <img
        :src="imgUrl"
        :alt="fileName"
        :draggable="dragMode"
        @load="onImgLoad"
        :style="{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          cursor: dragMode ? 'grab' : (dragging ? 'grabbing' : 'grab'),
          userSelect: 'none',
          maxWidth: 'none',
          transformOrigin: 'center center',
          visibility: imgLoaded ? 'visible' : 'hidden',
        }"
        class="viewer-img"
      />

      <!-- Prev / Next nav buttons -->
      <button
        v-if="prevImage"
        class="nav-btn nav-btn--left"
        :title="prevImage.name"
        @click.stop="navigatePrev"
      >
        <v-icon size="28">mdi-chevron-left</v-icon>
      </button>
      <button
        v-if="nextImage"
        class="nav-btn nav-btn--right"
        :title="nextImage.name"
        @click.stop="navigateNext"
      >
        <v-icon size="28">mdi-chevron-right</v-icon>
      </button>

      <!-- Toolbar -->
      <div class="viewer-toolbar">
        <span class="text-caption mr-2 toolbar-filename">{{ fileName }}</span>
        <span v-if="currentIndex >= 0" class="text-caption text-medium-emphasis mr-4 toolbar-counter">
          {{ currentIndex + 1 }} / {{ imageEntries.length }}
        </span>
        <v-btn
          v-if="imgLoaded"
          icon size="small"
          :variant="dragMode ? 'flat' : 'tonal'"
          :color="dragMode ? 'primary' : undefined"
          class="mr-1"
          @click.stop="dragMode = !dragMode"
          :title="dragMode ? t('imageViewer.panMode') : t('imageViewer.dragMode')"
        >
          <v-icon>{{ dragMode ? 'mdi-cursor-move' : 'mdi-drag' }}</v-icon>
        </v-btn>
        <v-btn icon size="small" variant="tonal" @click="reset" :title="t('imageViewer.resetView')">
          <v-icon>mdi-fit-to-screen</v-icon>
        </v-btn>
        <v-btn icon size="small" variant="tonal" class="ml-1" @click="dialog = false" :title="t('imageViewer.close')">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>

      <div class="zoom-hint text-caption text-grey">
        {{ dragMode ? t('imageViewer.dragHint') : t('imageViewer.zoomHint') }}
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.viewer-bg {
  width: 100%;
  height: 100%;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  user-select: none;
}
.viewer-img {
  position: absolute;
  max-width: none;
}
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.45);
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  z-index: 10;
  transition: background 0.15s;
}
.nav-btn:hover { background: rgba(0, 0, 0, 0.7); }
.nav-btn--left  { left: 16px; }
.nav-btn--right { right: 16px; }
.viewer-toolbar {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  background: rgba(var(--v-theme-surface), 0.75);
  padding: 6px 12px;
  border-radius: 8px;
  z-index: 10;
  backdrop-filter: blur(8px);
  max-width: calc(100vw - 24px);
  min-width: 0;
}
.toolbar-filename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 1;
}
.toolbar-counter {
  white-space: nowrap;
  flex-shrink: 0;
}
.zoom-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.4);
  padding: 4px 12px;
  border-radius: 12px;
  max-width: calc(100vw - 32px);
  text-align: center;
  white-space: normal;
  line-height: 1.5;
}
</style>

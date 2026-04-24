<script setup>
import { ref, reactive, computed, watch, inject, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  file:       { type: Object, required: true },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})

const { t }      = useI18n()
const services   = inject('services')
const fileStore  = services?.get('explorer.state')
const eventBus   = services?.get('event.bus')
const winMgrSvc  = services?.get('window.manager')
const imagesApi  = services?.get('images.api')
const appRegistry = services?.get('app.registry')

function openEditor() {
  appRegistry?.open(props.file, { app: 'image-editor' })
}

const imgUrl    = ref('')
const imgLoaded = ref(false)
const imgError  = ref(false)
const dragMode  = ref(false)

const transform = reactive({ scale: 1, x: 0, y: 0 })
const dragging  = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
const rotation  = ref(0)
let fitScale = 1

watch(() => props.file, (f) => {
  if (!f) return
  imgUrl.value    = imagesApi.fullUrl(f.path)
  imgLoaded.value = false
  imgError.value  = false
  dragMode.value  = false
  fitScale = 1
  rotation.value = 0
  transform.scale = 1; transform.x = 0; transform.y = 0
  props.winManager?.setTitle(props.winId, f.name)
}, { immediate: true })

// ── Adjacent-image navigation ─────────────────────────────────────────────────
const imageEntries = computed(() => fileStore?.displayedEntries.filter(f => f.type === 'image') ?? [])
const currentIndex = computed(() => imageEntries.value.findIndex(f => f.path === props.file?.path))
const prevImage    = computed(() => currentIndex.value > 0 ? imageEntries.value[currentIndex.value - 1] : null)
const nextImage    = computed(() => currentIndex.value >= 0 && currentIndex.value < imageEntries.value.length - 1 ? imageEntries.value[currentIndex.value + 1] : null)

function navigatePrev() {
  if (prevImage.value) props.winManager?.setProps(props.winId, { file: prevImage.value })
}
function navigateNext() {
  if (nextImage.value) props.winManager?.setProps(props.winId, { file: nextImage.value })
}

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

function reset() { transform.scale = fitScale; transform.x = 0; transform.y = 0 }

function zoomIn()  { transform.scale = Math.min(20, transform.scale * 1.25) }
function zoomOut() { transform.scale = Math.max(0.05, transform.scale * 0.8) }
function rotate()  { rotation.value = (rotation.value + 90) % 360 }

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
function onDblClick(e) { if (!dragMode.value && !e.target.closest('.viewer-toolbar')) reset() }

// ── Touch ─────────────────────────────────────────────────────────────────────
let pinchDist0 = 0, pinchScale0 = 1, pinchMidX = 0, pinchMidY = 0
let velX = 0, velY = 0, rafId = null
const lastPts = []
const FRICTION = 0.95

function touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function stopInertia() { if (rafId) { cancelAnimationFrame(rafId); rafId = null } }

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
  stopInertia(); lastPts.length = 0
  if (e.touches.length === 1) {
    dragging.value = true
    dragStart.x = e.touches[0].clientX - transform.x
    dragStart.y = e.touches[0].clientY - transform.y
  } else if (e.touches.length === 2) {
    dragging.value = false; velX = 0; velY = 0
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
    transform.scale = newScale; return
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

// ── Keyboard shortcuts (only when this window is focused) ─────────────────────
function isFocused() {
  if (!props.winId || !winMgrSvc) return false
  return winMgrSvc.windows.find(w => w.id === props.winId)?.focused ?? false
}

function onKey({ key, raw }) {
  if (!isFocused()) return
  if (key === 'ArrowLeft')  { raw.preventDefault(); navigatePrev() }
  if (key === 'ArrowRight') { raw.preventDefault(); navigateNext() }
  if (key === '+')          { raw.preventDefault(); zoomIn() }
  if (key === '-')          { raw.preventDefault(); zoomOut() }
  if (key === 'r')          { raw.preventDefault(); rotate() }
}

eventBus?.on('keyboard:keydown', onKey)
onUnmounted(() => eventBus?.off('keyboard:keydown', onKey))
</script>

<template>
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
    <div v-if="imgError" class="d-flex flex-column align-center justify-center" style="color:#aaa; gap:12px">
      <v-icon size="48">mdi-image-broken-variant</v-icon>
      <span class="text-body-2">{{ t('imageApp.loadError') }}</span>
    </div>
    <img
      v-else
      :src="imgUrl"
      :alt="props.file?.name"
      :draggable="dragMode"
      @load="onImgLoad"
      @error="imgError = true"
      :style="{
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${rotation}deg)`,
        cursor: dragMode ? 'grab' : (dragging ? 'grabbing' : 'grab'),
        userSelect: 'none',
        maxWidth: 'none',
        transformOrigin: 'center center',
        visibility: imgLoaded ? 'visible' : 'hidden',
      }"
      class="viewer-img"
    />

    <button v-if="prevImage" class="nav-btn nav-btn--left" :title="prevImage.name" @click.stop="navigatePrev">
      <v-icon size="28">mdi-chevron-left</v-icon>
    </button>
    <button v-if="nextImage" class="nav-btn nav-btn--right" :title="nextImage.name" @click.stop="navigateNext">
      <v-icon size="28">mdi-chevron-right</v-icon>
    </button>

    <div class="viewer-toolbar">
      <span v-if="currentIndex >= 0" class="text-caption text-medium-emphasis mr-4 toolbar-counter">
        {{ currentIndex + 1 }} / {{ imageEntries.length }}
      </span>
      <v-btn v-if="imgLoaded" icon size="small"
        :variant="dragMode ? 'flat' : 'tonal'"
        :color="dragMode ? 'primary' : undefined"
        class="mr-1"
        @click.stop="dragMode = !dragMode"
        :title="dragMode ? t('imageApp.panMode') : t('imageApp.dragMode')"
      >
        <v-icon>{{ dragMode ? 'mdi-cursor-move' : 'mdi-drag' }}</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="tonal" @click.stop="reset" :title="t('imageApp.resetView')">
        <v-icon>mdi-fit-to-screen</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="tonal" class="ml-1" @click.stop="rotate" :title="t('imageApp.rotate')">
        <v-icon>mdi-rotate-right</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="tonal" class="ml-1" @click.stop="zoomIn">
        <v-icon>mdi-magnify-plus-outline</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="tonal" class="ml-1" @click.stop="zoomOut">
        <v-icon>mdi-magnify-minus-outline</v-icon>
      </v-btn>
      <v-btn
        v-if="!props.file?.path?.startsWith('http')"
        icon size="small" variant="tonal" class="ml-2"
        @click.stop="openEditor" :title="t('action.editImage')"
      >
        <v-icon>mdi-image-edit-outline</v-icon>
      </v-btn>
    </div>

    <div class="zoom-hint text-caption text-grey">
      {{ dragMode ? t('imageApp.dragHint') : t('imageApp.zoomHint') }}
    </div>
  </div>
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
.viewer-img { position: absolute; max-width: none; }
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0,0,0,0.45);
  border: none; border-radius: 50%;
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #fff;
  transition: background 0.15s;
}
.nav-btn:hover { background: rgba(0,0,0,0.7); }
.nav-btn--left  { left: 16px; }
.nav-btn--right { right: 16px; }
.viewer-toolbar {
  position: absolute;
  top: 8px; right: 8px;
  display: flex; align-items: center;
  background: rgba(var(--v-theme-surface), 0.75);
  padding: 4px 8px;
  border-radius: 8px;
  backdrop-filter: blur(8px);
}
.toolbar-counter { white-space: nowrap; flex-shrink: 0; }
.zoom-hint {
  position: absolute;
  bottom: 12px; left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.4);
  padding: 4px 12px; border-radius: 12px;
  text-align: center; white-space: normal; line-height: 1.5;
}
</style>

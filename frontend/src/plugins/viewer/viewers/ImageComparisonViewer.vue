<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { imagesApi } from '@/services/api.js'

const { t } = useI18n()

const dialog    = ref(false)
const leftFile  = ref(null)
const rightFile = ref(null)
const sliderPct = ref(50)

// transform.scale = userZoom (multiplied onto each image's base scale)
const transform = reactive({ scale: 1, x: 0, y: 0 })
const dragging  = ref(false)
const sliding   = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
const bgEl      = ref(null)

// Per-image base scales, computed once both images are loaded so
// both images appear at the same rendered height.
const baseScales  = reactive({ left: 1, right: 1 })
let leftNW = 0, leftNH = 0
let rightNW = 0, rightNH = 0
let leftLoaded = false, rightLoaded = false
const imgsReady = ref(false)

function open(files) {
  leftFile.value  = files[0]
  rightFile.value = files[1]
  sliderPct.value = 50
  leftLoaded = false; rightLoaded = false
  imgsReady.value = false
  baseScales.left = 1; baseScales.right = 1
  transform.scale = 1; transform.x = 0; transform.y = 0
  dialog.value = true
}

const leftUrl  = computed(() => leftFile.value  ? imagesApi.fullUrl(leftFile.value.path)  : '')
const rightUrl = computed(() => rightFile.value ? imagesApi.fullUrl(rightFile.value.path) : '')

// Called once both images have loaded.
// Computes a common rendered height so both images appear the same height
// while ensuring neither exceeds the viewport at userZoom = 1.
function computeBaseScales() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const commonH = Math.min(
    vh,
    vw * leftNH  / leftNW,
    vw * rightNH / rightNW
  )
  baseScales.left  = commonH / leftNH
  baseScales.right = commonH / rightNH
  transform.scale = 1; transform.x = 0; transform.y = 0
  imgsReady.value = true
}

function onLeftImgLoad(e) {
  const { naturalWidth: iw, naturalHeight: ih } = e.target
  if (!iw || !ih) return
  leftNW = iw; leftNH = ih; leftLoaded = true
  if (rightLoaded) computeBaseScales()
}

function onRightImgLoad(e) {
  const { naturalWidth: iw, naturalHeight: ih } = e.target
  if (!iw || !ih) return
  rightNW = iw; rightNH = ih; rightLoaded = true
  if (leftLoaded) computeBaseScales()
}

function reset() {
  transform.scale = 1; transform.x = 0; transform.y = 0
}

function onWheel(e) {
  if (sliding.value) return
  e.preventDefault()
  const factor   = e.deltaY < 0 ? 1.12 : 0.89
  const newScale = Math.max(0.05, Math.min(20, transform.scale * factor))
  const ratio    = newScale / transform.scale
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  transform.x = e.clientX - cx - (e.clientX - cx - transform.x) * ratio
  transform.y = e.clientY - cy - (e.clientY - cy - transform.y) * ratio
  transform.scale = newScale
}

function onMouseDown(e) {
  if (e.button !== 0 || sliding.value) return
  dragging.value = true
  dragStart.x = e.clientX - transform.x
  dragStart.y = e.clientY - transform.y
}

function onMouseMove(e) {
  if (sliding.value) {
    if (!bgEl.value) return
    const rect = bgEl.value.getBoundingClientRect()
    sliderPct.value = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))
    return
  }
  if (!dragging.value) return
  transform.x = e.clientX - dragStart.x
  transform.y = e.clientY - dragStart.y
}

function onMouseUp() {
  dragging.value = false
  sliding.value  = false
}

function startSlide(e) {
  e.preventDefault()
  sliding.value = true
}

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
  if (sliding.value) return
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
  if (sliding.value) {
    if (!bgEl.value) return
    const rect = bgEl.value.getBoundingClientRect()
    sliderPct.value = Math.max(0, Math.min(100, (e.touches[0].clientX - rect.left) / rect.width * 100))
    return
  }
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
  const wasSliding = sliding.value
  dragging.value = false
  sliding.value  = false
  if (wasSliding) { velX = 0; velY = 0; return }
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

function startSlideTouch(e) {
  e.stopPropagation()
  e.preventDefault()
  sliding.value = true
}

function makeImgStyle(base) {
  return {
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${base * transform.scale})`,
    cursor: dragging.value ? 'grabbing' : 'grab',
    userSelect: 'none',
    maxWidth: 'none',
    transformOrigin: 'center center',
  }
}
const leftImgStyle  = computed(() => makeImgStyle(baseScales.left))
const rightImgStyle = computed(() => makeImgStyle(baseScales.right))

defineExpose({ open })
</script>

<template>
  <v-dialog v-model="dialog" fullscreen :scrim="false">
    <div
      ref="bgEl"
      class="viewer-bg"
      @wheel.prevent="onWheel"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @touchstart="onTouchStart"
      @touchmove.prevent="onTouchMove"
      @touchend="onTouchEnd"
      @dblclick="reset"
    >
      <!-- Right image — clipped to show only right of the slider -->
      <div class="img-panel" :style="{ clipPath: `inset(0 0 0 ${sliderPct}%)` }">
        <img
          :src="rightUrl"
          :alt="rightFile?.name"
          draggable="false"
          @load="onRightImgLoad"
          class="viewer-img"
          :style="{ ...rightImgStyle, visibility: imgsReady ? 'visible' : 'hidden' }"
        />
      </div>

      <!-- Left image — clipped to show only left of the slider -->
      <div class="img-panel" :style="{ clipPath: `inset(0 ${100 - sliderPct}% 0 0)` }">
        <img
          :src="leftUrl"
          :alt="leftFile?.name"
          draggable="false"
          @load="onLeftImgLoad"
          class="viewer-img"
          :style="{ ...leftImgStyle, visibility: imgsReady ? 'visible' : 'hidden' }"
        />
      </div>

      <!-- Filename labels -->
      <div class="img-label img-label-left">{{ leftFile?.name }}</div>
      <div class="img-label img-label-right">{{ rightFile?.name }}</div>

      <!-- Divider slider -->
      <div
        class="divider-line"
        :style="{ left: sliderPct + '%' }"
        @mousedown.stop="startSlide"
        @touchstart.stop.prevent="startSlideTouch"
      >
        <div class="divider-handle">
          <v-icon size="14" color="#333">mdi-chevron-left</v-icon>
          <v-icon size="14" color="#333">mdi-chevron-right</v-icon>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="viewer-toolbar">
        <v-btn icon size="small" variant="tonal" @click="reset" :title="t('imageViewer.resetView')">
          <v-icon>mdi-fit-to-screen</v-icon>
        </v-btn>
        <v-btn icon size="small" variant="tonal" class="ml-1" @click="dialog = false" :title="t('imageViewer.close')">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>

      <!-- Hint -->
      <div class="zoom-hint text-caption text-grey">
        {{ t('imageComparison.hint') }}
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
.img-panel {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.divider-line {
  position: absolute;
  top: 0;
  height: 100%;
  width: 3px;
  background: rgba(255, 255, 255, 0.9);
  transform: translateX(-50%);
  cursor: col-resize;
  z-index: 20;
  user-select: none;
}
.divider-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  cursor: col-resize;
}
.img-label {
  position: absolute;
  bottom: 48px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 3px 10px;
  border-radius: 8px;
  font-size: 12px;
  z-index: 15;
  pointer-events: none;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.img-label-left  { left: 12px; }
.img-label-right { right: 12px; }
.viewer-toolbar {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  background: rgba(var(--v-theme-surface), 0.75);
  padding: 6px 12px;
  border-radius: 8px;
  z-index: 30;
  backdrop-filter: blur(8px);
}
.zoom-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 12px;
  border-radius: 12px;
  z-index: 15;
  pointer-events: none;
  max-width: calc(100vw - 32px);
  text-align: center;
  white-space: normal;
  line-height: 1.5;
}
</style>

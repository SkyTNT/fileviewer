<script setup>
import { ref, inject, watch, computed, onMounted, onUnmounted } from 'vue'
import { compositeLayers } from './LayerCompositor.js'
import { drawMarchingAnts } from './marchingAnts.js'
import { getTool } from '../tools/toolRegistry.js'
import CropTool from '../tools/CropTool.js'

const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const invalidateRef = inject('editorInvalidate')
const viewport = inject('editorViewport')
const editorApi = inject('editorApi')

const shellEl = ref(null)
const displayCanvas = ref(null)
const overlayCanvas = ref(null)
let rafId = null
let compositeDirty = true

// Connect shell element to viewport's containerRef
watch(shellEl, (el) => { viewport.containerRef.value = el })

const activeTool = computed(() => getTool(state.activeTool))

function toolCtx() {
  return {
    state,
    viewport,
    pushHistory: (label) => pushHistory(label, state),
    invalidate: () => { compositeDirty = true; state.paintTick++ },
    editorApi,
  }
}

// ── Canvas resize ──────────────────────────────────────────────────────────────
function resizeCanvases(w, h) {
  if (!displayCanvas.value || !overlayCanvas.value || !w || !h) return
  displayCanvas.value.width = w
  displayCanvas.value.height = h
  overlayCanvas.value.width = w
  overlayCanvas.value.height = h
  compositeDirty = true
}

watch(() => [state.canvasWidth, state.canvasHeight], ([w, h]) => resizeCanvases(w, h))

// Canvas group style: centered at viewport center + pan + zoom
const canvasGroupStyle = computed(() => ({
  width: `${state.canvasWidth}px`,
  height: `${state.canvasHeight}px`,
  marginLeft: `-${state.canvasWidth / 2}px`,
  marginTop: `-${state.canvasHeight / 2}px`,
  transform: `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`,
}))

// ── RAF loop ───────────────────────────────────────────────────────────────────
function rafLoop() {
  if (displayCanvas.value && state.canvasWidth && state.canvasHeight) {
    if (compositeDirty) {
      const ctx = displayCanvas.value.getContext('2d', { willReadFrequently: true })
      compositeLayers(ctx, state.layers, state.canvasWidth, state.canvasHeight)
      compositeDirty = false
    }
    const octx = overlayCanvas.value?.getContext('2d', { willReadFrequently: true })
    if (octx) {
      octx.clearRect(0, 0, state.canvasWidth, state.canvasHeight)
      drawMarchingAnts(octx, state)
      activeTool.value?.renderOverlay?.(octx, state)
    }
  }
  rafId = requestAnimationFrame(rafLoop)
}

onMounted(() => {
  resizeCanvases(state.canvasWidth, state.canvasHeight)
  rafId = requestAnimationFrame(rafLoop)
  invalidateRef.value = () => { compositeDirty = true }
})
onUnmounted(() => { if (rafId) cancelAnimationFrame(rafId) })

// ── Pan state ─────────────────────────────────────────────────────────────────
let _panning = false
let _panStart = { x: 0, y: 0, panX: 0, panY: 0 }
const spaceDown = ref(false)

function onDocKeyDown(e) {
  if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    spaceDown.value = true
    e.preventDefault()
  }
}
function onDocKeyUp(e) { if (e.code === 'Space') spaceDown.value = false }

onMounted(() => {
  document.addEventListener('keydown', onDocKeyDown)
  document.addEventListener('keyup', onDocKeyUp)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onDocKeyDown)
  document.removeEventListener('keyup', onDocKeyUp)
})

// ── Pointer events ─────────────────────────────────────────────────────────────
function syntheticEvent(e) {
  const pos = viewport.screenToCanvas(e.clientX, e.clientY)
  return {
    x: pos.x, y: pos.y,
    sx: e.clientX, sy: e.clientY,
    buttons: e.buttons, button: e.button,
    shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey,
    pressure: e.pressure || 0.5,
  }
}

function updateCursor(e) {
  const pos = viewport.screenToCanvas(e.clientX, e.clientY)
  state.cursorX = pos.x
  state.cursorY = pos.y
  state.cursorInCanvas = pos.x >= 0 && pos.x < state.canvasWidth && pos.y >= 0 && pos.y < state.canvasHeight
}

function onPointerDown(e) {
  e.currentTarget.setPointerCapture(e.pointerId)
  updateCursor(e)
  if (e.button === 1 || spaceDown.value) {
    _panning = true
    _panStart = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY }
    return
  }
  if (e.button === 0) {
    activeTool.value?.onPointerDown?.(syntheticEvent(e), toolCtx())
  }
}

function onPointerMove(e) {
  updateCursor(e)
  if (_panning) {
    state.panX = _panStart.panX + (e.clientX - _panStart.x)
    state.panY = _panStart.panY + (e.clientY - _panStart.y)
    return
  }
  activeTool.value?.onPointerMove?.(syntheticEvent(e), toolCtx())
}

function onPointerUp(e) {
  if (_panning) { _panning = false; return }
  if (e.button === 0) {
    activeTool.value?.onPointerUp?.(syntheticEvent(e), toolCtx())
  }
}

function onPointerLeave() {
  state.cursorInCanvas = false
  _panning = false
}

function onWheel(e) {
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    viewport.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89)
  } else {
    state.panX -= e.deltaX
    state.panY -= e.deltaY
  }
}

// Watch tool changes for activate/deactivate hooks
watch(() => state.activeTool, (newId, oldId) => {
  if (oldId) getTool(oldId)?.onDeactivate?.(toolCtx())
  getTool(newId)?.onActivate?.(toolCtx())
})

const cursorStyle = computed(() => {
  void state.paintTick  // re-evaluate when tool calls invalidate() (e.g. cursor changes on handle hover)
  return spaceDown.value ? (_panning ? 'grabbing' : 'grab') : (activeTool.value?.cursor || 'crosshair')
})
</script>

<template>
  <div
    ref="shellEl"
    class="canvas-viewport"
    :style="{ cursor: cursorStyle }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerLeave"
    @wheel.prevent="onWheel"
  >
    <div class="canvas-group" :style="canvasGroupStyle">
      <canvas ref="displayCanvas" class="layer-canvas" />
      <canvas ref="overlayCanvas" class="layer-canvas overlay-canvas" />
      <div v-if="state.showGrid" class="grid-overlay" />
    </div>
  </div>
</template>

<style scoped>
.canvas-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1a1a1a;
  background-image: linear-gradient(45deg, #222 25%, transparent 25%),
    linear-gradient(-45deg, #222 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #222 75%),
    linear-gradient(-45deg, transparent 75%, #222 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  touch-action: none;
}
.canvas-group {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center center;
}
.layer-canvas {
  position: absolute;
  top: 0; left: 0;
  display: block;
  image-rendering: pixelated;
}
.overlay-canvas {
  pointer-events: none;
}
.grid-overlay {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  background-image:
    repeating-linear-gradient(0deg, rgba(128,128,128,0.3) 0, rgba(128,128,128,0.3) 1px, transparent 1px, transparent 32px),
    repeating-linear-gradient(90deg, rgba(128,128,128,0.3) 0, rgba(128,128,128,0.3) 1px, transparent 1px, transparent 32px);
}
</style>

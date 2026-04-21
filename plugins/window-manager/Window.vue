<template>
  <v-card
    class="app-window"
    :class="{
      'is-maximized': win.maximized,
      'is-minimized': win.minimized,
      'is-focused':   win.focused,
    }"
    :style="windowStyle"
    :elevation="win.focused ? 16 : 4"
    rounded="lg"
    @mousedown.capture="onFocus"
  >
    <!-- Title bar -->
    <v-toolbar
      class="win-titlebar"
      :color="win.focused ? 'primary' : 'surface-variant'"
      density="compact"
      height="36"
      @mousedown.prevent="startDrag"
      @touchstart.prevent="startDragTouch"
      @dblclick="toggleMaximize"
    >
      <v-icon size="16" class="ml-2 mr-1" :color="win.focused ? 'on-primary' : undefined">
        {{ win.icon || 'mdi-window-maximize' }}
      </v-icon>
      <v-toolbar-title
        class="win-title"
        :style="win.focused ? 'color: rgb(var(--v-theme-on-primary))' : ''"
      >
        {{ win.title }}
      </v-toolbar-title>

      <div class="win-controls" @mousedown.stop @touchstart.stop>
        <v-btn
          :color="win.focused ? 'on-primary' : undefined"
          icon size="x-small" variant="text"
          title="Minimize"
          @click="emit('minimize')"
        >
          <v-icon size="16">mdi-minus</v-icon>
        </v-btn>
        <v-btn
          :color="win.focused ? 'on-primary' : undefined"
          icon size="x-small" variant="text"
          title="Maximize"
          @click="toggleMaximize"
        >
          <v-icon size="16">{{ win.maximized ? 'mdi-window-restore' : 'mdi-window-maximize' }}</v-icon>
        </v-btn>
        <v-btn
          color="error"
          icon size="x-small" variant="text"
          title="Close"
          class="win-close-btn"
          @click="emit('close')"
        >
          <v-icon size="16">mdi-close</v-icon>
        </v-btn>
      </div>
    </v-toolbar>

    <!-- Content -->
    <div class="win-content">
      <slot />
    </div>

    <!-- Resize handles (8 directions) -->
    <template v-if="!win.maximized">
      <div class="resize-handle resize-n"  @mousedown.prevent.stop="startResize('n')"  @touchstart.prevent.stop="startResizeTouch('n')" />
      <div class="resize-handle resize-s"  @mousedown.prevent.stop="startResize('s')"  @touchstart.prevent.stop="startResizeTouch('s')" />
      <div class="resize-handle resize-e"  @mousedown.prevent.stop="startResize('e')"  @touchstart.prevent.stop="startResizeTouch('e')" />
      <div class="resize-handle resize-w"  @mousedown.prevent.stop="startResize('w')"  @touchstart.prevent.stop="startResizeTouch('w')" />
      <div class="resize-handle resize-ne" @mousedown.prevent.stop="startResize('ne')" @touchstart.prevent.stop="startResizeTouch('ne')" />
      <div class="resize-handle resize-nw" @mousedown.prevent.stop="startResize('nw')" @touchstart.prevent.stop="startResizeTouch('nw')" />
      <div class="resize-handle resize-se" @mousedown.prevent.stop="startResize('se')" @touchstart.prevent.stop="startResizeTouch('se')" />
      <div class="resize-handle resize-sw" @mousedown.prevent.stop="startResize('sw')" @touchstart.prevent.stop="startResizeTouch('sw')" />
    </template>
  </v-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  win: { type: Object, required: true },
})
const emit = defineEmits(['focus', 'close', 'minimize', 'maximize', 'update:position', 'update:size'])

const MIN_W = 320
const MIN_H = 200

const windowStyle = computed(() => {
  if (props.win.minimized) return { display: 'none' }
  if (props.win.maximized) return { zIndex: props.win.z }
  return {
    left:   props.win.x + 'px',
    top:    props.win.y + 'px',
    width:  props.win.w + 'px',
    height: props.win.h + 'px',
    zIndex: props.win.z,
  }
})

function onFocus() { emit('focus') }
function toggleMaximize() { emit('maximize') }

// ── Drag ──────────────────────────────────────────────────────────────────────
let dragOx = 0, dragOy = 0

function startDrag(e) {
  if (props.win.maximized) return
  dragOx = e.clientX - props.win.x
  dragOy = e.clientY - props.win.y
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', stopDrag, { once: true })
}

function onDragMove(e) {
  emit('update:position', {
    x: Math.max(0, e.clientX - dragOx),
    y: Math.max(0, e.clientY - dragOy),
  })
}

function stopDrag() {
  window.removeEventListener('mousemove', onDragMove)
}

function startDragTouch(e) {
  if (props.win.maximized) return
  const t = e.touches[0]
  dragOx = t.clientX - props.win.x
  dragOy = t.clientY - props.win.y
  window.addEventListener('touchmove', onDragMoveTouch, { passive: false })
  window.addEventListener('touchend', stopDragTouch, { once: true })
}

function onDragMoveTouch(e) {
  e.preventDefault()
  const t = e.touches[0]
  emit('update:position', {
    x: Math.max(0, t.clientX - dragOx),
    y: Math.max(0, t.clientY - dragOy),
  })
}

function stopDragTouch() {
  window.removeEventListener('touchmove', onDragMoveTouch)
}

// ── Resize ────────────────────────────────────────────────────────────────────
let resizeDir = ''
let resizeStartX = 0, resizeStartY = 0
let resizeStartW = 0, resizeStartH = 0
let resizeStartPX = 0, resizeStartPY = 0

function startResize(dir) {
  resizeDir     = dir
  resizeStartX  = event.clientX
  resizeStartY  = event.clientY
  resizeStartW  = props.win.w
  resizeStartH  = props.win.h
  resizeStartPX = props.win.x
  resizeStartPY = props.win.y
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', stopResize, { once: true })
}

function onResizeMove(e) {
  const dx = e.clientX - resizeStartX
  const dy = e.clientY - resizeStartY
  let x = resizeStartPX, y = resizeStartPY
  let w = resizeStartW,  h = resizeStartH

  if (resizeDir.includes('e')) w = Math.max(MIN_W, resizeStartW + dx)
  if (resizeDir.includes('s')) h = Math.max(MIN_H, resizeStartH + dy)
  if (resizeDir.includes('w')) {
    const newW = Math.max(MIN_W, resizeStartW - dx)
    x = resizeStartPX + (resizeStartW - newW)
    w = newW
  }
  if (resizeDir.includes('n')) {
    const newH = Math.max(MIN_H, resizeStartH - dy)
    y = resizeStartPY + (resizeStartH - newH)
    h = newH
  }

  emit('update:position', { x, y })
  emit('update:size', { w, h })
}

function stopResize() {
  window.removeEventListener('mousemove', onResizeMove)
}

function startResizeTouch(dir) {
  const t = event.touches[0]
  resizeDir     = dir
  resizeStartX  = t.clientX
  resizeStartY  = t.clientY
  resizeStartW  = props.win.w
  resizeStartH  = props.win.h
  resizeStartPX = props.win.x
  resizeStartPY = props.win.y
  window.addEventListener('touchmove', onResizeMoveTouch, { passive: false })
  window.addEventListener('touchend', stopResizeTouch, { once: true })
}

function onResizeMoveTouch(e) {
  e.preventDefault()
  const t = e.touches[0]
  const dx = t.clientX - resizeStartX
  const dy = t.clientY - resizeStartY
  let x = resizeStartPX, y = resizeStartPY
  let w = resizeStartW,  h = resizeStartH

  if (resizeDir.includes('e')) w = Math.max(MIN_W, resizeStartW + dx)
  if (resizeDir.includes('s')) h = Math.max(MIN_H, resizeStartH + dy)
  if (resizeDir.includes('w')) {
    const newW = Math.max(MIN_W, resizeStartW - dx)
    x = resizeStartPX + (resizeStartW - newW)
    w = newW
  }
  if (resizeDir.includes('n')) {
    const newH = Math.max(MIN_H, resizeStartH - dy)
    y = resizeStartPY + (resizeStartH - newH)
    h = newH
  }

  emit('update:position', { x, y })
  emit('update:size', { w, h })
}

function stopResizeTouch() {
  window.removeEventListener('touchmove', onResizeMoveTouch)
}
</script>

<style scoped>
.app-window {
  position: fixed !important;
  display: flex;
  flex-direction: column;
  min-width: 320px;
  min-height: 200px;
  transition: box-shadow 0.2s, left 0s, top 0s, width 0s, height 0s;
}
.app-window.is-maximized {
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  border-radius: 0 !important;
}

.win-titlebar {
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}

.win-title {
  font-size: 13px !important;
  font-weight: 500;
}

.win-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: 4px;
}

.win-close-btn:hover {
  background: rgba(var(--v-theme-error), 0.9) !important;
  color: white !important;
}

.win-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Resize handles */
.resize-handle { position: absolute; }
.resize-n  { top: 0;    left: 4px;  right: 4px;  height: 4px; cursor: n-resize; }
.resize-s  { bottom: 0; left: 4px;  right: 4px;  height: 4px; cursor: s-resize; }
.resize-e  { right: 0;  top: 4px;   bottom: 4px; width: 4px;  cursor: e-resize; }
.resize-w  { left: 0;   top: 4px;   bottom: 4px; width: 4px;  cursor: w-resize; }
.resize-ne { top: 0;    right: 0;   width: 10px; height: 10px; cursor: ne-resize; }
.resize-nw { top: 0;    left: 0;    width: 10px; height: 10px; cursor: nw-resize; }
.resize-se { bottom: 0; right: 0;   width: 10px; height: 10px; cursor: se-resize; }
.resize-sw { bottom: 0; left: 0;    width: 10px; height: 10px; cursor: sw-resize; }

@media (pointer: coarse) {
  .resize-n, .resize-s { height: 10px; }
  .resize-e, .resize-w { width: 10px; }
  .resize-ne, .resize-nw, .resize-se, .resize-sw { width: 20px; height: 20px; }
}
</style>

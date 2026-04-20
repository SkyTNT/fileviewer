<template>
  <div
    class="app-window"
    :class="{
      'is-maximized': win.maximized,
      'is-minimized': win.minimized,
      'is-focused':   win.focused,
    }"
    :style="windowStyle"
    @mousedown.capture="onFocus"
  >
    <!-- Title bar -->
    <div
      class="win-titlebar"
      @mousedown.prevent="startDrag"
      @dblclick="toggleMaximize"
    >
      <v-icon size="16" class="win-icon mr-2">{{ win.icon || 'mdi-window-maximize' }}</v-icon>
      <span class="win-title text-truncate">{{ win.title }}</span>
      <div class="win-controls ml-auto" @mousedown.stop>
        <button class="win-btn win-minimize" title="Minimize" @click="emit('minimize')">
          <v-icon size="14">mdi-minus</v-icon>
        </button>
        <button class="win-btn win-maximize" title="Maximize" @click="toggleMaximize">
          <v-icon size="14">{{ win.maximized ? 'mdi-window-restore' : 'mdi-window-maximize' }}</v-icon>
        </button>
        <button class="win-btn win-close" title="Close" @click="emit('close')">
          <v-icon size="14">mdi-close</v-icon>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="win-content">
      <slot />
    </div>

    <!-- Resize handles (8 directions) -->
    <template v-if="!win.maximized">
      <div class="resize-handle resize-n"  @mousedown.prevent.stop="startResize('n')" />
      <div class="resize-handle resize-s"  @mousedown.prevent.stop="startResize('s')" />
      <div class="resize-handle resize-e"  @mousedown.prevent.stop="startResize('e')" />
      <div class="resize-handle resize-w"  @mousedown.prevent.stop="startResize('w')" />
      <div class="resize-handle resize-ne" @mousedown.prevent.stop="startResize('ne')" />
      <div class="resize-handle resize-nw" @mousedown.prevent.stop="startResize('nw')" />
      <div class="resize-handle resize-se" @mousedown.prevent.stop="startResize('se')" />
      <div class="resize-handle resize-sw" @mousedown.prevent.stop="startResize('sw')" />
    </template>
  </div>
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
</script>

<style scoped>
.app-window {
  position: fixed;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2);
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  transition: box-shadow 0.15s;
  min-width: 320px;
  min-height: 200px;
}
.app-window.is-maximized {
  position: fixed;
  inset: 0;
  border-radius: 0;
  width: 100vw !important;
  height: 100vh !important;
}
.app-window.is-focused {
  box-shadow: 0 12px 48px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.25);
}

.win-titlebar {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 36px;
  flex-shrink: 0;
  cursor: move;
  user-select: none;
  background: rgba(var(--v-theme-surface-variant), 0.6);
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.win-icon  { opacity: 0.7; flex-shrink: 0; }
.win-title { font-size: 13px; font-weight: 500; flex: 1; min-width: 0; }

.win-controls { display: flex; gap: 4px; }
.win-btn {
  width: 24px; height: 24px;
  border: none; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.6;
  transition: opacity 0.1s, background 0.1s;
}
.win-btn:hover { opacity: 1; background: rgba(var(--v-theme-on-surface), 0.1); }
.win-close:hover { background: rgba(var(--v-theme-error), 0.8) !important; color: white; opacity: 1; }

.win-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Resize handles */
.resize-handle {
  position: absolute;
}
.resize-n  { top: 0;    left: 4px;  right: 4px;  height: 4px; cursor: n-resize; }
.resize-s  { bottom: 0; left: 4px;  right: 4px;  height: 4px; cursor: s-resize; }
.resize-e  { right: 0;  top: 4px;   bottom: 4px; width: 4px;  cursor: e-resize; }
.resize-w  { left: 0;   top: 4px;   bottom: 4px; width: 4px;  cursor: w-resize; }
.resize-ne { top: 0;    right: 0;   width: 10px; height: 10px; cursor: ne-resize; }
.resize-nw { top: 0;    left: 0;    width: 10px; height: 10px; cursor: nw-resize; }
.resize-se { bottom: 0; right: 0;   width: 10px; height: 10px; cursor: se-resize; }
.resize-sw { bottom: 0; left: 0;    width: 10px; height: 10px; cursor: sw-resize; }
</style>

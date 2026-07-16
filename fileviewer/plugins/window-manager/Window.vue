<template>
  <v-card
    ref="rootEl"
    class="app-window"
    :class="{
      'is-maximized':      win.maximized,
      'is-minimized':      win.minimized,
      'is-focused':        win.focused,
      'is-opening':        opening,
      'is-closing':        win.closing,
      'is-minimizing-out': win.minimizingOut,
      'is-animate-max':    win.animateMax,
    }"
    :style="windowStyle"
    :elevation="win.focused ? 16 : 4"
    rounded="lg"
    @mousedown.capture="onFocus"
  >
    <!-- Title bar -->
    <v-toolbar
      v-if="!win.noTitleBar"
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
import { computed, provide, ref, onMounted, watch, nextTick } from 'vue'

const props = defineProps({
  win: { type: Object, required: true },
})
const emit = defineEmits(['focus', 'close', 'minimize', 'maximize', 'update:position', 'update:size'])

const MIN_W = 20
const MIN_H = 20

const rootEl = ref(null)

const opening = ref(true)
onMounted(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => { opening.value = false }))
})

const windowStyle = computed(() => {
  const w = props.win
  if (w.minimized && !w.minimizingOut && !w.restoring) return { display: 'none' }
  if (w.maximized) return { left: '0', top: '0', width: '100vw', height: '100vh', zIndex: w.z }
  return {
    left:   w.x + 'px',
    top:    w.y + 'px',
    width:  w.w + 'px',
    height: w.h + 'px',
    zIndex: w.z,
  }
})

function _chipRect(id) {
  const chip = document.querySelector(`[data-win-id="${id}"]`)
  return chip?.getBoundingClientRect() ?? { left: 0, top: window.innerHeight - 40, width: 120, height: 36 }
}

// ── Minimize animation (flush:post so chip is already in DOM) ─────────────────
watch(() => props.win.minimizingOut, async (val) => {
  if (!val) return
  await nextTick()
  const el = rootEl.value?.$el
  if (!el) { props.win.minimizingOut = false; return }

  const winRect = el.getBoundingClientRect()
  const chip = _chipRect(props.win.id)
  const tx = (chip.left + chip.width / 2) - (winRect.left + winRect.width / 2)
  const ty = (chip.top  + chip.height / 2) - (winRect.top  + winRect.height / 2)
  const scale = chip.width / winRect.width

  const anim = el.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${tx}px,${ty}px) scale(${scale})`, opacity: 0 },
  ], { duration: 260, easing: 'cubic-bezier(0.4,0,1,1)' })

  anim.finished.then(() => {
    anim.cancel()
    props.win.minimizingOut = false
  })
}, { flush: 'post' })

// ── Restore animation (default pre-flush so chip is still in DOM to query) ────
watch(() => props.win.restoring, async (val) => {
  if (!val) return

  // Chip still in DOM here (DOM not updated yet)
  const chip = _chipRect(props.win.id)
  await nextTick()

  const el = rootEl.value?.$el
  if (!el) { props.win.restoring = false; return }

  const winCx = props.win.x + props.win.w / 2
  const winCy = props.win.y + props.win.h / 2
  const tx = (chip.left + chip.width / 2) - winCx
  const ty = (chip.top  + chip.height / 2) - winCy
  const scale = chip.width / props.win.w

  const anim = el.animate([
    { transform: `translate(${tx}px,${ty}px) scale(${scale})`, opacity: 0 },
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
  ], { duration: 280, easing: 'cubic-bezier(0,0,0.2,1)', fill: 'both' })

  anim.finished.then(() => {
    anim.cancel()
    props.win.restoring = false
  })
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

provide('winDrag', { startDrag, startDragTouch })

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
  transition: box-shadow 0.2s,
              transform 0.18s cubic-bezier(0.2, 0, 0, 1),
              opacity 0.18s;
  transform-origin: center center;
}
.app-window.is-animate-max {
  transition: left   0.22s cubic-bezier(0.2, 0, 0, 1),
              top    0.22s cubic-bezier(0.2, 0, 0, 1),
              width  0.22s cubic-bezier(0.2, 0, 0, 1),
              height 0.22s cubic-bezier(0.2, 0, 0, 1),
              border-radius 0.22s,
              box-shadow 0.22s;
}
.app-window.is-maximized {
  border-radius: 0 !important;
}
.app-window.is-opening {
  transform: scale(0.9);
  opacity: 0;
}
.app-window.is-closing {
  transform: scale(0.9);
  opacity: 0;
  pointer-events: none;
}
.app-window.is-minimizing-out {
  pointer-events: none;
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

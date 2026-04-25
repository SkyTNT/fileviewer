<script setup>
import { inject, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LayerThumbnail from './LayerThumbnail.vue'
import BlendModeSelect from './BlendModeSelect.vue'
import { createLayer, newLayerId } from '../editorState.js'

const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const { invalidate } = inject('editorInvalidateObj')
const { t } = useI18n()

const reversed = computed(() => [...state.layers].reverse())

function setActive(id) { state.activeLayerId = id }

function addLayer() {
  const layer = createLayer(`Layer ${state.layers.length + 1}`, state.canvasWidth, state.canvasHeight)
  state.layers.push(layer)
  state.activeLayerId = layer.id
  pushHistory('Add Layer', state)
  state.isDirty = true
}

function deleteLayer() {
  if (state.layers.length <= 1) return
  const idx = state.layers.findIndex(l => l.id === state.activeLayerId)
  state.layers.splice(idx, 1)
  state.activeLayerId = state.layers[Math.min(idx, state.layers.length - 1)].id
  pushHistory('Delete Layer', state)
  state.isDirty = true
  invalidate()
}

function duplicateLayer() {
  const src = state.layers.find(l => l.id === state.activeLayerId)
  if (!src) return
  const copy = createLayer(src.name + ' copy', src.canvas.width, src.canvas.height)
  copy.opacity = src.opacity; copy.blendMode = src.blendMode
  copy.offsetX = src.offsetX; copy.offsetY = src.offsetY
  copy.canvas.getContext('2d', { willReadFrequently: true }).drawImage(src.canvas, 0, 0)
  const idx = state.layers.findIndex(l => l.id === state.activeLayerId)
  state.layers.splice(idx + 1, 0, copy)
  state.activeLayerId = copy.id
  pushHistory('Duplicate Layer', state)
  state.isDirty = true
  invalidate()
}

function mergeDown() {
  const idx = state.layers.findIndex(l => l.id === state.activeLayerId)
  if (idx === 0) return
  const above = state.layers[idx]
  const below = state.layers[idx - 1]
  const ctx = below.canvas.getContext('2d', { willReadFrequently: true })
  ctx.save()
  ctx.globalAlpha = above.opacity
  ctx.globalCompositeOperation = above.blendMode
  ctx.drawImage(above.canvas, above.offsetX - below.offsetX, above.offsetY - below.offsetY)
  ctx.restore()
  state.layers.splice(idx, 1)
  state.activeLayerId = below.id
  pushHistory('Merge Down', state)
  state.isDirty = true
  invalidate()
}

function flattenAll() {
  if (state.layers.length <= 1) return
  const flat = new OffscreenCanvas(state.canvasWidth, state.canvasHeight)
  const ctx = flat.getContext('2d', { willReadFrequently: true })
  for (const l of state.layers) {
    if (!l.visible) continue
    ctx.save()
    ctx.globalAlpha = l.opacity
    ctx.globalCompositeOperation = l.blendMode
    ctx.drawImage(l.canvas, l.offsetX, l.offsetY)
    ctx.restore()
  }
  const single = createLayer('Background', state.canvasWidth, state.canvasHeight)
  single.canvas.getContext('2d', { willReadFrequently: true }).drawImage(flat, 0, 0)
  state.layers.splice(0, state.layers.length, single)
  state.activeLayerId = single.id
  pushHistory('Flatten', state)
  state.isDirty = true
  invalidate()
}

function moveLayer(fromIdx, toIdx) {
  if (toIdx < 0 || toIdx >= state.layers.length) return
  const layer = state.layers.splice(fromIdx, 1)[0]
  state.layers.splice(toIdx, 0, layer)
  state.isDirty = true
  invalidate()
}

function moveUp() {
  const idx = state.layers.findIndex(l => l.id === state.activeLayerId)
  if (idx < state.layers.length - 1) moveLayer(idx, idx + 1)
}
function moveDown() {
  const idx = state.layers.findIndex(l => l.id === state.activeLayerId)
  if (idx > 0) moveLayer(idx, idx - 1)
}

// Drag-to-reorder
let _dragIdx = null
function onDragStart(e, idx) {
  _dragIdx = state.layers.length - 1 - idx  // reversed index → real index
  e.dataTransfer.effectAllowed = 'move'
}
function onDrop(e, idx) {
  const toIdx = state.layers.length - 1 - idx
  if (_dragIdx !== null && _dragIdx !== toIdx) moveLayer(_dragIdx, toIdx)
  _dragIdx = null
}
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
</script>

<template>
  <div class="layer-panel">
    <!-- Header actions -->
    <div class="panel-header">
      <span class="panel-title">{{ t('editor.layers') }}</span>
      <div class="panel-actions">
        <v-btn icon size="x-small" variant="text" @click="addLayer" :title="t('editor.addLayer')"><v-icon>mdi-plus</v-icon></v-btn>
        <v-btn icon size="x-small" variant="text" @click="duplicateLayer" :title="t('editor.duplicateLayer')"><v-icon>mdi-content-copy</v-icon></v-btn>
        <v-btn icon size="x-small" variant="text" @click="mergeDown" :title="t('editor.mergeDown')"><v-icon>mdi-arrow-collapse-down</v-icon></v-btn>
        <v-btn icon size="x-small" variant="text" @click="flattenAll" :title="t('editor.flatten')"><v-icon>mdi-layers-minus</v-icon></v-btn>
        <v-btn icon size="x-small" variant="text" color="error" @click="deleteLayer" :title="t('editor.deleteLayer')" :disabled="state.layers.length <= 1"><v-icon>mdi-delete</v-icon></v-btn>
      </div>
    </div>

    <!-- Active layer controls -->
    <div v-if="state.activeLayerId" class="layer-controls">
      <BlendModeSelect
        :model-value="state.layers.find(l => l.id === state.activeLayerId)?.blendMode"
        @update:model-value="v => { const l = state.layers.find(l => l.id === state.activeLayerId); if (l) { l.blendMode = v; invalidate() } }"
      />
      <div class="d-flex align-center gap-1 mt-1">
        <span class="opt-label">{{ t('editor.opacity') }}</span>
        <v-slider
          :model-value="state.layers.find(l => l.id === state.activeLayerId)?.opacity ?? 1"
          @update:model-value="v => { const l = state.layers.find(l2 => l2.id === state.activeLayerId); if (l) { l.opacity = v; invalidate() } }"
          :min="0" :max="1" :step="0.01" hide-details density="compact" class="flex-grow-1"
        />
      </div>
    </div>

    <!-- Layer list -->
    <div class="layer-list">
      <div
        v-for="(layer, i) in reversed"
        :key="layer.id"
        class="layer-item"
        :class="{ active: layer.id === state.activeLayerId }"
        draggable="true"
        @click="setActive(layer.id)"
        @dragstart="onDragStart($event, i)"
        @dragover="onDragOver"
        @drop="onDrop($event, i)"
      >
        <v-btn icon size="x-small" variant="text" @click.stop="layer.visible = !layer.visible; invalidate()"
          :title="layer.visible ? t('editor.hideLayer') : t('editor.showLayer')">
          <v-icon size="16">{{ layer.visible ? 'mdi-eye' : 'mdi-eye-off' }}</v-icon>
        </v-btn>
        <LayerThumbnail :layer="layer" />
        <span class="layer-name">{{ layer.name }}</span>
        <div class="layer-reorder">
          <v-btn icon size="x-small" variant="text" @click.stop="moveUp" :disabled="state.layers.findIndex(l=>l.id===layer.id) === state.layers.length-1"><v-icon size="12">mdi-chevron-up</v-icon></v-btn>
          <v-btn icon size="x-small" variant="text" @click.stop="moveDown" :disabled="state.layers.findIndex(l=>l.id===layer.id) === 0"><v-icon size="12">mdi-chevron-down</v-icon></v-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layer-panel { display: flex; flex-direction: column; height: 100%; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.panel-title { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.5px; }
.panel-actions { display: flex; gap: 2px; }
.layer-controls { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.layer-list { overflow-y: auto; flex: 1; }
.layer-item {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 8px; cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background 0.1s;
}
.layer-item:hover { background: rgba(255,255,255,0.05); }
.layer-item.active { background: rgba(var(--v-theme-primary), 0.15); }
.layer-name { font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.layer-reorder { display: flex; flex-direction: column; }
.opt-label { font-size: 11px; color: rgba(255,255,255,0.6); white-space: nowrap; }
</style>

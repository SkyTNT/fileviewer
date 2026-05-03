<script setup>
import { ref, provide, inject, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { createEditorState, createLayer, getActiveLayer, hexToRgb as hexToRgbLocal } from './editor/editorState.js'
import { createHistory } from './editor/useHistory.js'
import { createEditorApi } from './editor/editorApi.js'
import { createViewport } from './editor/canvas/useViewport.js'
import { createKeyboardHandler } from './editor/useKeyboard.js'
import { flattenToBlob } from './editor/canvas/LayerCompositor.js'
import { getTool } from './editor/tools/toolRegistry.js'
import { TOOL_GROUPS, TOOL_ICONS } from './editor/tools/toolRegistry.js'
import MoveTool from './editor/tools/MoveTool.js'
import { runFilter } from './editor/filters/filterRunner.js'
import { invertSelection, selectionToMask } from './editor/selectionUtils.js'

import CanvasViewport from './editor/canvas/CanvasViewport.vue'
import ToolOptionsBar from './editor/panels/ToolOptionsBar.vue'
import ColorPickerWidget from './editor/panels/ColorPickerWidget.vue'
import LayerPanel from './editor/layers/LayerPanel.vue'
import HistoryPanel from './editor/panels/HistoryPanel.vue'
import AdjustmentsPanel from './editor/adjustments/AdjustmentsPanel.vue'
import CanvasResizeDialog from './editor/dialogs/CanvasResizeDialog.vue'
import ImageResizeDialog from './editor/dialogs/ImageResizeDialog.vue'
import RotateCanvasDialog from './editor/dialogs/RotateCanvasDialog.vue'
import ExportDialog from './editor/dialogs/ExportDialog.vue'
import SaveAsDialog from './editor/dialogs/SaveAsDialog.vue'
import FilterDialog from './editor/filters/FilterDialog.vue'

const props = defineProps({
  file: { type: Object, required: true },
  winId: { type: String, default: null },
  winManager: { type: Object, default: null },
})

const { t } = useI18n()
const services = inject('services')
const eventBus = services?.get('event.bus')
const winMgrSvc = services?.get('window.manager')
const imagesApi = services?.get('images.api')

// ── Core state ─────────────────────────────────────────────────────────────────
const state = createEditorState()
const historyAPI = createHistory(50)
const { store: history, push: pushHistory, undo, redo } = historyAPI
const canUndo = computed(() => history.currentIndex > 0)
const canRedo = computed(() => history.currentIndex < history.steps.length - 1)

function doUndo() { undo(state); invalidate() }
function doRedo() { redo(state); invalidate() }
const editorApi = createEditorApi()
const viewport = createViewport(state)

// ── Invalidate callback (set by CanvasViewport on mount) ────────────────────────
const invalidateRef = ref(() => {})
function invalidate() { invalidateRef.value(); state.paintTick++ }
const invalidateObj = { invalidate }

// ── Provide to children ────────────────────────────────────────────────────────
provide('editorState', state)
provide('editorHistory', {
  history,
  pushHistory: (label, s) => { pushHistory(label, s ?? state); state.isDirty = true },
  undo: (s) => { undo(s ?? state); invalidate() },
  redo: (s) => { redo(s ?? state); invalidate() },
  jumpTo: (idx, s) => { historyAPI.jumpTo(idx, s ?? state); invalidate() },
})
provide('editorInvalidate', invalidateRef)
provide('editorInvalidateObj', invalidateObj)
provide('editorViewport', viewport)
provide('editorApi', editorApi)
provide('editorToolCtx', computed(() => ({
  state,
  history,
  viewport,
  pushHistory: (label) => pushHistory(label, state),
  invalidate,
  editorApi,
})))

// ── Dialog state ───────────────────────────────────────────────────────────────
const showCanvasResize = ref(false)
const showImageResize = ref(false)
const showRotate = ref(false)
const showExport = ref(false)
const showSaveAs = ref(false)
const showUnsavedDialog = ref(false)
const activeFilterDialog = ref(null)

// Right panel tab
const rightTab = ref('layers')

// ── Load image ─────────────────────────────────────────────────────────────────
const loading = ref(false)

async function loadImage() {
  loading.value = true
  try {
    if (props.file.name?.toLowerCase().endsWith('.psd')) {
      await loadPsdLayers()
    } else {
      await loadRasterImage()
    }
  } catch (e) {
    console.error('Failed to load image for editing:', e)
  } finally {
    loading.value = false
  }
}

async function loadRasterImage() {
  const url = imagesApi?.fullUrl(props.file.path) || `/api/images/full?path=${encodeURIComponent(props.file.path)}`
  const res = await fetch(url, { credentials: 'include' })
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const w = bitmap.width, h = bitmap.height
  const layer = createLayer('Background', w, h)
  layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0)
  bitmap.close()
  state.canvasWidth = w
  state.canvasHeight = h
  state.layers = [layer]
  state.activeLayerId = layer.id
  state.filePath = props.file.path
  state.fileName = props.file.name
  state.isDirty = false
  setTimeout(() => viewport.fitToWindow(), 50)
  pushHistory('Open', state)
}

async function loadPsdLayers() {
  let psdData = null
  try {
    const res = await fetch(`/api/images/psd-layers?path=${encodeURIComponent(props.file.path)}`, { credentials: 'include' })
    if (res.ok) psdData = await res.json()
  } catch (_) { /* fall through */ }

  if (!psdData?.layers?.length) {
    await loadRasterImage()
    return
  }

  const { width, height, layers: psdLayers } = psdData
  const editorLayers = []
  for (const psdLayer of psdLayers) {
    const layer = createLayer(psdLayer.name, width, height)
    layer.visible = psdLayer.visible
    layer.opacity = psdLayer.opacity
    layer.blendMode = psdLayer.blendMode
    if (psdLayer.imageData) {
      try {
        const blob = await fetch(psdLayer.imageData).then(r => r.blob())
        const bitmap = await createImageBitmap(blob)
        layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, psdLayer.x, psdLayer.y)
        bitmap.close()
      } catch (_) { /* leave layer empty */ }
    }
    editorLayers.push(layer)
  }

  state.canvasWidth = width
  state.canvasHeight = height
  state.layers = editorLayers.length ? editorLayers : [createLayer('Background', width || 100, height || 100)]
  state.activeLayerId = state.layers[state.layers.length - 1]?.id ?? null
  state.filePath = props.file.path
  state.fileName = props.file.name
  state.isDirty = false
  setTimeout(() => viewport.fitToWindow(), 50)
  pushHistory('Open', state)
}

onMounted(loadImage)

// ── Import image as layer ──────────────────────────────────────────────────────
async function importImageAsLayer() {
  const picker = services?.get('file.picker')
  if (!picker) return

  winMgrSvc?.minimize(props.winId)
  const entry = await picker.pick({ filter: 'image' })
  winMgrSvc?.minimize(props.winId)

  if (!entry) return

  const url = imagesApi?.fullUrl(entry.path) ?? `/api/images/full?path=${encodeURIComponent(entry.path)}`
  const res = await fetch(url, { credentials: 'include' })
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const layer = createLayer(entry.name, state.canvasWidth, state.canvasHeight)
  state.layers.push(layer)
  state.activeLayerId = layer.id
  state.isDirty = true
  pushHistory('Import Layer', state)
  invalidate()

  // enter free transform on the new layer
  state.activeTool = 'move'
  const toolCtx = { state, history, viewport, pushHistory: (label) => pushHistory(label, state), invalidate, editorApi }
  MoveTool.startTransformFromBitmap(bitmap, layer, toolCtx)
  bitmap.close()
}

// ── Save operations ────────────────────────────────────────────────────────────
const saving = ref(false)
const saveError = ref('')

async function save() {
  if (!state.isDirty) return
  saving.value = true; saveError.value = ''
  try {
    const ext = state.fileName.split('.').pop()?.toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
    const blob = await flattenToBlob(state.layers, state.canvasWidth, state.canvasHeight, mime)
    await editorApi.saveImage(state.filePath, blob)
    state.isDirty = false
    services?.get('notification.show')?.success(t('editor.savedSuccess', { name: state.fileName }))
  } catch (e) {
    saveError.value = String(e)
    services?.get('notification.show')?.error(t('editor.savedError', { error: e.message }))
  } finally {
    saving.value = false
  }
}

// ── Keyboard handler ───────────────────────────────────────────────────────────
function isFocused() {
  if (!props.winId || !winMgrSvc) return true
  return winMgrSvc.windows.find(w => w.id === props.winId)?.focused ?? false
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
    ctx.drawImage(l.canvas, 0, 0)
    ctx.restore()
  }
  const bg = createLayer('Background', state.canvasWidth, state.canvasHeight)
  bg.canvas.getContext('2d', { willReadFrequently: true }).drawImage(flat, 0, 0)
  state.layers.splice(0, state.layers.length, bg)
  state.activeLayerId = bg.id
  pushHistory('Flatten', state)
  state.isDirty = true
  invalidate()
}

const actions = {
  save,
  saveAs: () => { showSaveAs.value = true },
  exportDialog: () => { showExport.value = true },
  fitToWindow: () => viewport.fitToWindow(),
  zoomIn: () => { state.zoom = Math.min(32, state.zoom * 1.25) },
  zoomOut: () => { state.zoom = Math.max(0.02, state.zoom * 0.8) },
  selectAll: () => { state.selection = { type: 'rect', bounds: { x: 0, y: 0, w: state.canvasWidth, h: state.canvasHeight }, points: null } },
  deselect: () => { state.selection = null },
  invertSelection: () => { state.selection = invertSelection(state.selection, state.canvasWidth, state.canvasHeight) },
  fillSelection: () => {
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
    if (state.selection) {
      const mask = selectionToMask(state.selection, state.canvasWidth, state.canvasHeight)
      const imgData = ctx.getImageData(0, 0, state.canvasWidth, state.canvasHeight)
      const { r, g, b } = hexToRgbLocal(state.fgColor)
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) { imgData.data[i*4] = r; imgData.data[i*4+1] = g; imgData.data[i*4+2] = b; imgData.data[i*4+3] = 255 }
      }
      ctx.putImageData(imgData, 0, 0)
    } else {
      ctx.save(); ctx.fillStyle = state.fgColor; ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight); ctx.restore()
    }
    pushHistory('Fill Selection', state)
    state.isDirty = true
    invalidate()
  },
  invalidate: () => invalidate(),
}

const handleKey = createKeyboardHandler(state, historyAPI, actions, isFocused)
onMounted(() => eventBus?.on('keyboard:keydown', handleKey))
onUnmounted(() => { eventBus?.off('keyboard:keydown', handleKey); services?.get('file.picker')?.cancel() })

// ── Unsaved close guard ────────────────────────────────────────────────────────
function tryClose() {
  if (state.isDirty) { showUnsavedDialog.value = true }
  else { props.winManager?.close(props.winId) }
}
function discardAndClose() { showUnsavedDialog.value = false; props.winManager?.close(props.winId) }
async function saveAndClose() { showUnsavedDialog.value = false; await save(); if (!saveError.value) props.winManager?.close(props.winId) }

// ── Filter menu definitions ────────────────────────────────────────────────────
const FILTER_DIALOGS = {
  gaussian_blur: { label: 'editor.blur', params: [{ key: 'radius', label: 'Radius', min: 0.5, max: 30, step: 0.5, default: 2 }] },
  unsharp_mask: { label: 'editor.unsharpMask', params: [
    { key: 'radius', label: 'Radius', min: 0.5, max: 30, step: 0.5, default: 2 },
    { key: 'percent', label: 'Amount %', min: 0, max: 500, step: 5, default: 150 },
    { key: 'threshold', label: 'Threshold', min: 0, max: 50, step: 1, default: 3 },
  ]},
  reduce_noise: { label: 'editor.reduceNoise', params: [{ key: 'size', label: 'Size', min: 3, max: 15, step: 2, default: 3 }] },
  sharpen: { label: 'editor.sharpen', params: [{ key: 'amount', label: 'Amount', min: 0, max: 3, step: 0.1, default: 0.5 }] },
  noise: { label: 'editor.noise', params: [{ key: 'amount', label: 'Amount', min: 1, max: 100, step: 1, default: 25 }] },
  vignette: { label: 'editor.vignette', params: [{ key: 'strength', label: 'Strength', min: 0, max: 1, step: 0.05, default: 0.5 }, { key: 'radius', label: 'Radius', min: 0, max: 1, step: 0.05, default: 0.75 }] },
  pixelate: { label: 'editor.pixelate', params: [{ key: 'size', label: 'Block Size', min: 2, max: 64, step: 1, default: 10 }] },
  chromatic_aberration: {
    label: 'editor.chromaticAberration',
    params: [
      { key: 'mode', label: t('editor.caMode'), type: 'select', options: [{ value: 'radial', label: t('editor.caRadial') }, { value: 'axial', label: t('editor.caAxial') }], default: 'radial' },
      { key: 'amount', label: t('editor.caAmount'), min: 0, max: 30, step: 0.5, default: 5 },
      { key: 'centerX', label: t('editor.caCenterX'), min: 0, max: 1, step: 0.01, default: 0.5, showWhen: { key: 'mode', value: 'radial' } },
      { key: 'centerY', label: t('editor.caCenterY'), min: 0, max: 1, step: 0.01, default: 0.5, showWhen: { key: 'mode', value: 'radial' } },
      { key: 'angle', label: t('editor.caAngle'), min: 0, max: 360, step: 1, default: 0, showWhen: { key: 'mode', value: 'axial' } },
    ],
  },
}

function openFilterDialog(id) {
  const def = FILTER_DIALOGS[id]
  if (def) activeFilterDialog.value = { id, label: t(def.label), params: def.params }
  else quickFilter(id)
}

async function quickFilter(id) {
  const layer = getActiveLayer(state)
  if (!layer || layer.locked) return
  await runFilter(id, {}, layer, state.selection)
  pushHistory(id, state)
  state.isDirty = true
  invalidate()
}

// ── Tool selection ─────────────────────────────────────────────────────────────
function selectTool(id) {
  state.activeTool = id
}

// ── Status bar text ───────────────────────────────────────────────────────────
const zoomPercent = computed(() => Math.round(state.zoom * 100) + '%')
const cursorInfo = computed(() =>
  state.cursorInCanvas
    ? `${Math.round(state.cursorX)}, ${Math.round(state.cursorY)}`
    : ''
)
</script>

<template>
  <div class="image-editor">
    <!-- ── Menu bar ──────────────────────────────────────────────────────────── -->
    <div class="menu-bar">
      <!-- File info -->
      <span class="editor-title">{{ state.fileName }}<span v-if="state.isDirty" class="dirty-mark">•</span></span>

      <!-- Image menu -->
      <v-menu :z-index="9999">
        <template #activator="{ props: mp }">
          <button class="menu-btn" v-bind="mp">{{ t('editor.menu.image') }}</button>
        </template>
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-image-size-select-large" :title="t('editor.imageResize')" @click="showImageResize = true" />
          <v-list-item prepend-icon="mdi-crop" :title="t('editor.canvasResize')" @click="showCanvasResize = true" />
          <v-divider />
          <v-list-item prepend-icon="mdi-rotate-right" :title="t('editor.rotateCanvas')" @click="showRotate = true" />
          <v-divider />
          <v-list-item prepend-icon="mdi-layers-minus" :title="t('editor.flatten')" @click="flattenAll" />
          <v-divider />
          <v-list-item prepend-icon="mdi-selection-ellipse-arrow-inside" :title="t('editor.fillSelection') + '  Shift+F5'" @click="actions.fillSelection()" />
          <v-list-item prepend-icon="mdi-selection-inverse" :title="t('editor.invertSelection') + '  Ctrl+Shift+I'" @click="actions.invertSelection()" />
          <v-divider />
          <v-list-item prepend-icon="mdi-image-plus" :title="t('editor.importImageAsLayer')" @click="importImageAsLayer" />
        </v-list>
      </v-menu>

      <!-- Filter menu -->
      <v-menu :z-index="9999">
        <template #activator="{ props: mp }">
          <button class="menu-btn" v-bind="mp">{{ t('editor.menu.filter') }}</button>
        </template>
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-blur" :title="t('editor.blur')" @click="openFilterDialog('gaussian_blur')" />
          <v-list-item prepend-icon="mdi-image-filter-vintage" :title="t('editor.sharpen')" @click="openFilterDialog('sharpen')" />
          <v-list-item :title="t('editor.unsharpMask')" @click="openFilterDialog('unsharp_mask')" />
          <v-list-item :title="t('editor.reduceNoise')" @click="openFilterDialog('reduce_noise')" />
          <v-divider />
          <v-list-item :title="t('editor.grayscale')" @click="quickFilter('grayscale')" />
          <v-list-item :title="t('editor.sepia')" @click="quickFilter('sepia')" />
          <v-list-item :title="t('editor.invert')" @click="quickFilter('invert')" />
          <v-divider />
          <v-list-item :title="t('editor.noise')" @click="openFilterDialog('noise')" />
          <v-list-item :title="t('editor.vignette')" @click="openFilterDialog('vignette')" />
          <v-list-item :title="t('editor.pixelate')" @click="openFilterDialog('pixelate')" />
          <v-list-item :title="t('editor.emboss')" @click="quickFilter('emboss')" />
          <v-list-item :title="t('editor.edgeDetect')" @click="quickFilter('edge_detect')" />
          <v-divider />
          <v-list-item :title="t('editor.chromaticAberration')" @click="openFilterDialog('chromatic_aberration')" />
        </v-list>
      </v-menu>

      <!-- View menu -->
      <v-menu :z-index="9999">
        <template #activator="{ props: mp }">
          <button class="menu-btn" v-bind="mp">{{ t('editor.menu.view') }}</button>
        </template>
        <v-list density="compact">
          <v-list-item :title="t('editor.fitToWindow') + '  Ctrl+0'" @click="viewport.fitToWindow()" />
          <v-list-item :title="t('editor.zoomIn') + '  Ctrl+'" @click="actions.zoomIn()" />
          <v-list-item :title="t('editor.zoomOut') + '  Ctrl+-'" @click="actions.zoomOut()" />
          <v-divider />
          <v-list-item>
            <v-switch v-model="state.showGrid" :label="t('editor.grid')" density="compact" hide-details class="ml-2" />
          </v-list-item>
        </v-list>
      </v-menu>

      <v-divider vertical class="mx-1" style="height:20px;align-self:center" />
      <v-btn icon size="small" variant="text" :disabled="!canUndo" :title="t('editor.undo') + '  Ctrl+Z'" @click="doUndo">
        <v-icon size="18">mdi-undo</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="text" :disabled="!canRedo" :title="t('editor.redo') + '  Ctrl+Y'" @click="doRedo">
        <v-icon size="18">mdi-redo</v-icon>
      </v-btn>

      <div class="menu-spacer" />

      <!-- File actions -->
      <v-btn size="small" variant="text" :loading="saving" @click="save" :disabled="!state.isDirty" class="mr-1">
        <v-icon start>mdi-content-save</v-icon>{{ t('editor.save') }}
      </v-btn>
      <v-btn size="small" variant="text" @click="showSaveAs = true" class="mr-1">
        <v-icon start>mdi-content-save-edit</v-icon>{{ t('editor.saveAs') }}
      </v-btn>
      <v-btn size="small" variant="tonal" @click="showExport = true">
        <v-icon start>mdi-export</v-icon>{{ t('editor.export') }}
      </v-btn>
      <v-btn icon size="small" variant="text" class="ml-1" @click="tryClose" :title="t('editor.close')">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </div>

    <!-- ── Body ─────────────────────────────────────────────────────────────── -->
    <div class="editor-body">
      <!-- Loading overlay -->
      <div v-if="loading" class="loading-overlay">
        <v-progress-circular indeterminate color="primary" size="48" />
      </div>
      <!-- Left toolbar -->
      <div class="tools-bar">
        <ColorPickerWidget />
        <v-divider class="my-2" />
        <template v-for="(group, gi) in TOOL_GROUPS" :key="gi">
          <v-btn
            v-for="toolId in group.tools"
            :key="toolId"
            icon size="small"
            :variant="state.activeTool === toolId ? 'flat' : 'text'"
            :color="state.activeTool === toolId ? 'primary' : undefined"
            class="tool-btn"
            :title="t('editor.tool.' + toolId)"
            @click="selectTool(toolId)"
          >
            <v-icon size="18">{{ TOOL_ICONS[toolId] }}</v-icon>
          </v-btn>
          <v-divider v-if="gi < TOOL_GROUPS.length - 1" class="my-1" />
        </template>
      </div>

      <!-- Center area -->
      <div class="editor-center">
        <ToolOptionsBar />
        <CanvasViewport class="flex-grow-1" />
        <!-- Status bar -->
        <div class="status-bar">
          <span class="status-item">{{ zoomPercent }}</span>
          <v-divider vertical class="mx-2" />
          <span class="status-item">{{ state.canvasWidth }} × {{ state.canvasHeight }}</span>
          <template v-if="cursorInfo">
            <v-divider vertical class="mx-2" />
            <span class="status-item">{{ cursorInfo }}</span>
          </template>
          <v-divider vertical class="mx-2" />
          <span class="status-item" :style="{ color: state.fgColor, textShadow: '0 0 2px #000' }">●</span>
          <span class="status-item mx-1">{{ state.fgColor }}</span>
        </div>
      </div>

      <!-- Right panel -->
      <div class="right-panel">
        <v-tabs v-model="rightTab" density="compact" class="right-tabs">
          <v-tab value="layers" :title="t('editor.layers')"><v-icon size="16">mdi-layers</v-icon></v-tab>
          <v-tab value="history" :title="t('editor.history')"><v-icon size="16">mdi-history</v-icon></v-tab>
          <v-tab value="adjustments" :title="t('editor.adjustments')"><v-icon size="16">mdi-tune</v-icon></v-tab>
        </v-tabs>
        <v-window v-model="rightTab" class="right-window">
          <v-window-item value="layers"><LayerPanel /></v-window-item>
          <v-window-item value="history"><HistoryPanel /></v-window-item>
          <v-window-item value="adjustments"><AdjustmentsPanel /></v-window-item>
        </v-window>
      </div>
    </div>

    <!-- ── Dialogs ───────────────────────────────────────────────────────────── -->
    <CanvasResizeDialog v-model="showCanvasResize" />
    <ImageResizeDialog v-model="showImageResize" />
    <RotateCanvasDialog v-model="showRotate" />
    <ExportDialog v-model="showExport" :file-path="state.filePath" />
    <SaveAsDialog v-model="showSaveAs" :file-path="state.filePath" @saved="f => { state.filePath = f; state.isDirty = false }" />

    <!-- Filter dialog (generic) -->
    <FilterDialog
      v-if="activeFilterDialog"
      :model-value="true"
      :filter-id="activeFilterDialog.id"
      :filter-label="activeFilterDialog.label"
      :params="activeFilterDialog.params ?? []"
      @update:model-value="v => { if (!v) activeFilterDialog = null }"
    />

    <!-- Unsaved changes dialog -->
    <v-dialog v-model="showUnsavedDialog" max-width="380">
      <v-card>
        <v-card-title>{{ t('editor.unsavedTitle') }}</v-card-title>
        <v-card-text>{{ t('editor.unsavedMessage', { name: state.fileName }) }}</v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="showUnsavedDialog = false">{{ t('editor.cancel') }}</v-btn>
          <v-spacer />
          <v-btn variant="text" color="error" @click="discardAndClose">{{ t('editor.discard') }}</v-btn>
          <v-btn variant="tonal" color="primary" @click="saveAndClose">{{ t('editor.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.image-editor {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  overflow: hidden;
}

/* Menu bar */
.menu-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 0 8px;
  gap: 2px;
  flex-shrink: 0;
  overflow: hidden;
}
.editor-title {
  font-size: 13px;
  font-weight: 500;
  margin-right: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.dirty-mark { color: #f8b400; margin-left: 4px; font-size: 18px; vertical-align: middle; }
.menu-btn {
  padding: 0 10px;
  height: 28px;
  background: none;
  border: none;
  color: rgba(var(--v-theme-on-surface), 0.8);
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.menu-btn:hover { background: rgba(var(--v-theme-on-surface), 0.08); }
.menu-spacer { flex: 1; }

/* Body */
.editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-surface), 0.75);
}

/* Left toolbar */
.tools-bar {
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgb(var(--v-theme-surface));
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 6px 0;
  overflow-y: auto;
  overflow-x: hidden;
  flex-shrink: 0;
  scrollbar-width: none;
}
.tools-bar::-webkit-scrollbar { display: none; }
.tool-btn { margin: 1px 0; }

/* Center */
.editor-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* Status bar */
.status-bar {
  display: flex;
  align-items: center;
  height: 22px;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 0 8px;
  flex-shrink: 0;
}
.status-item { font-size: 11px; color: rgba(var(--v-theme-on-surface), 0.6); white-space: nowrap; }

/* Right panel */
.right-panel {
  width: 240px;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
  overflow: hidden;
}
.right-tabs { flex-shrink: 0; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.right-window { flex: 1; overflow: hidden; }
.right-window :deep(.v-window__container) { height: 100%; }
.right-window :deep(.v-window-item) { height: 100%; overflow: hidden; display: flex; flex-direction: column; }
</style>

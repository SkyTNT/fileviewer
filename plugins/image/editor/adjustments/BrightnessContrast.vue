<script setup>
import { ref, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { getActiveLayer } from '../editorState.js'
import { brightness_contrast } from '../filters/clientFilters.js'

const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const { invalidate } = inject('editorInvalidateObj')
const { t } = useI18n()

const bv = ref(0)  // -1..1
const cv = ref(0)  // -1..1
let _previewSrc = null

function getLayer() { return getActiveLayer(state) }

function preview() {
  const layer = getLayer()
  if (!layer) return
  if (!_previewSrc) {
    _previewSrc = layer.canvas.getContext('2d').getImageData(0, 0, layer.canvas.width, layer.canvas.height)
  }
  // Restore original, then apply preview
  layer.canvas.getContext('2d').putImageData(_previewSrc, 0, 0)
  brightness_contrast(layer.canvas, { brightness: bv.value, contrast: cv.value })
  invalidate()
}

function apply() {
  const layer = getLayer()
  if (!layer) { reset(); return }
  pushHistory('Brightness/Contrast', state)
  // Ensure preview state is committed
  if (_previewSrc) {
    layer.canvas.getContext('2d').putImageData(_previewSrc, 0, 0)
  }
  brightness_contrast(layer.canvas, { brightness: bv.value, contrast: cv.value })
  state.isDirty = true
  invalidate()
  reset()
}

function cancel() {
  const layer = getLayer()
  if (layer && _previewSrc) {
    layer.canvas.getContext('2d').putImageData(_previewSrc, 0, 0)
    invalidate()
  }
  reset()
}

function reset() {
  _previewSrc = null
  bv.value = 0; cv.value = 0
}
</script>

<template>
  <div class="adj-panel">
    <div class="adj-row">
      <span class="adj-label">{{ t('editor.brightness') }}</span>
      <v-slider v-model="bv" :min="-1" :max="1" :step="0.01" hide-details density="compact" class="flex-grow-1" @update:model-value="preview" />
      <span class="adj-val">{{ Math.round(bv * 100) }}</span>
    </div>
    <div class="adj-row">
      <span class="adj-label">{{ t('editor.contrast') }}</span>
      <v-slider v-model="cv" :min="-1" :max="1" :step="0.01" hide-details density="compact" class="flex-grow-1" @update:model-value="preview" />
      <span class="adj-val">{{ Math.round(cv * 100) }}</span>
    </div>
    <div class="adj-actions">
      <v-btn size="x-small" variant="text" @click="cancel">{{ t('editor.cancel') }}</v-btn>
      <v-btn size="x-small" variant="tonal" color="primary" @click="apply">{{ t('editor.apply') }}</v-btn>
    </div>
  </div>
</template>

<style scoped>
.adj-panel { padding: 8px; }
.adj-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.adj-label { font-size: 11px; color: rgba(255,255,255,0.6); width: 68px; flex-shrink: 0; }
.adj-val { font-size: 11px; color: rgba(255,255,255,0.8); width: 28px; text-align: right; flex-shrink: 0; }
.adj-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 6px; }
</style>

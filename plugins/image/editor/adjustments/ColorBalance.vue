<script setup>
import { ref, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { getActiveLayer } from '../editorState.js'
import { color_balance } from '../filters/clientFilters.js'

const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const { invalidate } = inject('editorInvalidateObj')
const { t } = useI18n()

const shadows = ref([0, 0, 0])
const midtones = ref([0, 0, 0])
const highlights = ref([0, 0, 0])
let _previewSrc = null
const zone = ref('midtones')

function getLayer() { return getActiveLayer(state) }

function preview() {
  const layer = getLayer()
  if (!layer) return
  if (!_previewSrc) _previewSrc = layer.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, layer.canvas.width, layer.canvas.height)
  layer.canvas.getContext('2d', { willReadFrequently: true }).putImageData(_previewSrc, 0, 0)
  color_balance(layer.canvas, { shadows: shadows.value, midtones: midtones.value, highlights: highlights.value })
  invalidate()
}

function apply() {
  const layer = getLayer()
  if (!layer) { reset(); return }
  pushHistory('Color Balance', state)
  if (_previewSrc) layer.canvas.getContext('2d', { willReadFrequently: true }).putImageData(_previewSrc, 0, 0)
  color_balance(layer.canvas, { shadows: shadows.value, midtones: midtones.value, highlights: highlights.value })
  state.isDirty = true; invalidate(); reset()
}

function cancel() {
  const layer = getLayer()
  if (layer && _previewSrc) { layer.canvas.getContext('2d', { willReadFrequently: true }).putImageData(_previewSrc, 0, 0); invalidate() }
  reset()
}
function reset() { _previewSrc = null; shadows.value = [0,0,0]; midtones.value = [0,0,0]; highlights.value = [0,0,0] }

const channels = ['R', 'G', 'B']
function getZoneArr() { return zone.value === 'shadows' ? shadows.value : zone.value === 'highlights' ? highlights.value : midtones.value }
</script>

<template>
  <div class="adj-panel">
    <v-btn-toggle v-model="zone" density="compact" rounded="lg" mandatory class="mb-2">
      <v-btn value="shadows" size="x-small">{{ t('editor.shadows') }}</v-btn>
      <v-btn value="midtones" size="x-small">{{ t('editor.midtones') }}</v-btn>
      <v-btn value="highlights" size="x-small">{{ t('editor.highlights') }}</v-btn>
    </v-btn-toggle>
    <div v-for="(ch, ci) in channels" :key="ch" class="adj-row">
      <span class="adj-label">{{ ch }}</span>
      <v-slider
        :model-value="getZoneArr()[ci]"
        @update:model-value="v => { getZoneArr()[ci] = v; preview() }"
        :min="-100" :max="100" :step="1" hide-details density="compact" class="flex-grow-1"
      />
      <span class="adj-val">{{ getZoneArr()[ci] }}</span>
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
.adj-label { font-size: 11px; color: rgba(255,255,255,0.6); width: 20px; flex-shrink: 0; }
.adj-val { font-size: 11px; color: rgba(255,255,255,0.8); width: 36px; text-align: right; flex-shrink: 0; }
.adj-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 6px; }
</style>

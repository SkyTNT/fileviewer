<script setup>
import { ref, inject, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getActiveLayer } from '../editorState.js'
import { apply_lut } from '../filters/clientFilters.js'

const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const { invalidate } = inject('editorInvalidateObj')
const { t } = useI18n()

const histCanvas = ref(null)
const black = ref(0)
const gamma = ref(1.0)
const white = ref(255)
let _previewSrc = null
const HIST_W = 256, HIST_H = 80

function buildHistogram(imageData) {
  const hist = new Uint32Array(256)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    hist[Math.round(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114)]++
  }
  return hist
}

function drawHistogram(hist) {
  const canvas = histCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, HIST_W, HIST_H)
  const max = Math.max(...hist) || 1
  ctx.fillStyle = 'rgba(100,100,200,0.7)'
  for (let i = 0; i < 256; i++) {
    const h = (hist[i] / max) * HIST_H
    ctx.fillRect(i, HIST_H - h, 1, h)
  }
  // Draw black/white point lines
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(black.value, 0); ctx.lineTo(black.value, HIST_H); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(white.value, 0); ctx.lineTo(white.value, HIST_H); ctx.stroke()
}

function buildLUT() {
  const lut = new Uint8Array(256)
  const bv = Math.max(0, Math.min(254, black.value))
  const wv = Math.max(bv + 1, Math.min(255, white.value))
  const g = Math.max(0.1, Math.min(10, gamma.value))
  for (let i = 0; i < 256; i++) {
    const norm = Math.max(0, Math.min(1, (i - bv) / (wv - bv)))
    lut[i] = Math.round(Math.pow(norm, 1 / g) * 255)
  }
  return lut
}

function preview() {
  const layer = getActiveLayer(state)
  if (!layer) return
  if (!_previewSrc) _previewSrc = layer.canvas.getContext('2d').getImageData(0, 0, layer.canvas.width, layer.canvas.height)
  layer.canvas.getContext('2d').putImageData(_previewSrc, 0, 0)
  const lut = buildLUT()
  apply_lut(layer.canvas, lut, lut, lut)
  invalidate()
}

function apply() {
  const layer = getActiveLayer(state)
  if (!layer) { reset(); return }
  pushHistory('Levels', state)
  if (_previewSrc) layer.canvas.getContext('2d').putImageData(_previewSrc, 0, 0)
  const lut = buildLUT()
  apply_lut(layer.canvas, lut, lut, lut)
  state.isDirty = true; invalidate(); reset()
}

function cancel() {
  const layer = getActiveLayer(state)
  if (layer && _previewSrc) { layer.canvas.getContext('2d').putImageData(_previewSrc, 0, 0); invalidate() }
  reset()
}

function reset() { _previewSrc = null; black.value = 0; gamma.value = 1; white.value = 255 }

onMounted(() => {
  const layer = getActiveLayer(state)
  if (!layer) return
  const id = layer.canvas.getContext('2d').getImageData(0, 0, layer.canvas.width, layer.canvas.height)
  drawHistogram(buildHistogram(id))
})

watch([black, gamma, white], () => {
  const layer = getActiveLayer(state)
  if (!layer) return
  if (!_previewSrc) {
    const id = layer.canvas.getContext('2d').getImageData(0, 0, layer.canvas.width, layer.canvas.height)
    drawHistogram(buildHistogram(id))
  } else {
    const hist = buildHistogram(_previewSrc)
    drawHistogram(hist)
  }
})
</script>

<template>
  <div class="adj-panel">
    <canvas ref="histCanvas" :width="HIST_W" :height="HIST_H" class="hist-canvas" />
    <div class="adj-row mt-2">
      <span class="adj-label">{{ t('editor.black') }}</span>
      <v-slider v-model="black" :min="0" :max="254" :step="1" hide-details density="compact" class="flex-grow-1" @update:model-value="preview" />
      <span class="adj-val">{{ black }}</span>
    </div>
    <div class="adj-row">
      <span class="adj-label">{{ t('editor.gamma') }}</span>
      <v-slider v-model="gamma" :min="0.1" :max="10" :step="0.1" hide-details density="compact" class="flex-grow-1" @update:model-value="preview" />
      <span class="adj-val">{{ gamma.toFixed(1) }}</span>
    </div>
    <div class="adj-row">
      <span class="adj-label">{{ t('editor.white') }}</span>
      <v-slider v-model="white" :min="1" :max="255" :step="1" hide-details density="compact" class="flex-grow-1" @update:model-value="preview" />
      <span class="adj-val">{{ white }}</span>
    </div>
    <div class="adj-actions">
      <v-btn size="x-small" variant="text" @click="cancel">{{ t('editor.cancel') }}</v-btn>
      <v-btn size="x-small" variant="tonal" color="primary" @click="apply">{{ t('editor.apply') }}</v-btn>
    </div>
  </div>
</template>

<style scoped>
.adj-panel { padding: 8px; }
.hist-canvas { width: 100%; height: 80px; border-radius: 4px; background: rgba(0,0,0,0.4); display: block; }
.adj-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.adj-label { font-size: 11px; color: rgba(255,255,255,0.6); width: 50px; flex-shrink: 0; }
.adj-val { font-size: 11px; color: rgba(255,255,255,0.8); width: 36px; text-align: right; flex-shrink: 0; }
.adj-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 6px; }
</style>

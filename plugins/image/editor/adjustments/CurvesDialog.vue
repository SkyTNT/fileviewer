<script setup>
import { ref, inject, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getActiveLayer } from '../editorState.js'
import { apply_lut } from '../filters/clientFilters.js'

const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const { invalidate } = inject('editorInvalidateObj')
const { t } = useI18n()

const curveCanvas = ref(null)
const CURVE_W = 256, CURVE_H = 200
let _previewSrc = null
let _draggingIdx = -1

// Control points [[x, y]] in 0..255 range
const points = ref([[0, 0], [128, 128], [255, 255]])

function catmullRom(pts, t) {
  const n = pts.length - 1
  const seg = Math.min(Math.floor(t * n), n - 1)
  const p0 = pts[Math.max(0, seg - 1)]
  const p1 = pts[seg]
  const p2 = pts[Math.min(n, seg + 1)]
  const p3 = pts[Math.min(n, seg + 2)]
  const lt = t * n - seg
  return 0.5 * (
    (2 * p1[1]) +
    (-p0[1] + p2[1]) * lt +
    (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * lt * lt +
    (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * lt * lt * lt
  )
}

function buildLUT() {
  const sorted = [...points.value].sort((a, b) => a[0] - b[0])
  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.max(0, Math.min(255, Math.round(catmullRom(sorted, i / 255))))
  }
  return lut
}

function drawCurve() {
  const canvas = curveCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, CURVE_W, CURVE_H)
  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * CURVE_W / 4, 0); ctx.lineTo(i * CURVE_W / 4, CURVE_H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i * CURVE_H / 4); ctx.lineTo(CURVE_W, i * CURVE_H / 4); ctx.stroke()
  }
  // Diagonal
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.beginPath(); ctx.moveTo(0, CURVE_H); ctx.lineTo(CURVE_W, 0); ctx.stroke()
  // Curve
  const lut = buildLUT()
  ctx.strokeStyle = '#a0c4ff'; ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i < 256; i++) {
    const x = i, y = CURVE_H - lut[i] * CURVE_H / 255
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()
  // Control points
  const sorted = [...points.value].sort((a, b) => a[0] - b[0])
  for (const [px, py] of sorted) {
    const cx = px, cy = CURVE_H - py * CURVE_H / 255
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill()
    ctx.strokeStyle = '#a0c4ff'; ctx.lineWidth = 2; ctx.stroke()
  }
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
  pushHistory('Curves', state)
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
function reset() { _previewSrc = null; points.value = [[0,0],[128,128],[255,255]] }

function onMouseDown(e) {
  const rect = curveCanvas.value.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (CURVE_W / rect.width)
  const my = (e.clientY - rect.top) * (CURVE_H / rect.height)
  const px = mx, py = (CURVE_H - my) * 255 / CURVE_H
  const sorted = [...points.value].sort((a, b) => a[0] - b[0])
  let nearIdx = -1, nearDist = 15
  for (let i = 0; i < points.value.length; i++) {
    const d = Math.sqrt((points.value[i][0] - px) ** 2 + ((CURVE_H - points.value[i][1] * CURVE_H / 255) - my) ** 2)
    if (d < nearDist) { nearDist = d; nearIdx = i }
  }
  if (nearIdx >= 0) { _draggingIdx = nearIdx }
  else { points.value.push([Math.round(px), Math.round(py)]); _draggingIdx = points.value.length - 1 }
}

function onMouseMove(e) {
  if (_draggingIdx < 0) return
  const rect = curveCanvas.value.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (CURVE_W / rect.width)
  const my = (e.clientY - rect.top) * (CURVE_H / rect.height)
  points.value[_draggingIdx] = [
    Math.max(0, Math.min(255, Math.round(mx))),
    Math.max(0, Math.min(255, Math.round((CURVE_H - my) * 255 / CURVE_H))),
  ]
  drawCurve(); preview()
}

function onMouseUp() { _draggingIdx = -1 }

function onDblClick(e) {
  const rect = curveCanvas.value.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (CURVE_W / rect.width)
  const my = (e.clientY - rect.top) * (CURVE_H / rect.height)
  const px = mx, py2 = (CURVE_H - my) * 255 / CURVE_H
  let nearIdx = -1, nearDist = 15
  for (let i = 0; i < points.value.length; i++) {
    const d = Math.sqrt((points.value[i][0] - px) ** 2 + ((CURVE_H - points.value[i][1] * CURVE_H / 255) - my) ** 2)
    if (d < nearDist) { nearDist = d; nearIdx = i }
  }
  if (nearIdx >= 0 && points.value.length > 2) { points.value.splice(nearIdx, 1); drawCurve(); preview() }
}

watch(points, () => drawCurve(), { deep: true })
onMounted(() => drawCurve())
</script>

<template>
  <div class="adj-panel">
    <canvas
      ref="curveCanvas" :width="CURVE_W" :height="CURVE_H"
      class="curve-canvas"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @dblclick="onDblClick"
    />
    <div class="text-caption text-medium-emphasis mt-1">{{ t('editor.curvesHint') }}</div>
    <div class="adj-actions">
      <v-btn size="x-small" variant="text" @click="cancel">{{ t('editor.cancel') }}</v-btn>
      <v-btn size="x-small" variant="tonal" color="primary" @click="apply">{{ t('editor.apply') }}</v-btn>
    </div>
  </div>
</template>

<style scoped>
.adj-panel { padding: 8px; }
.curve-canvas { width: 100%; aspect-ratio: 1.28; border-radius: 4px; background: rgba(0,0,0,0.5); cursor: crosshair; display: block; }
.adj-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 8px; }
</style>

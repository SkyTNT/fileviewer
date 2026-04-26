<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb } from '../editorState.js'

const props = defineProps({ modelValue: String })
const emit = defineEmits(['update:modelValue'])

const svCanvas = ref(null)
const hueCanvas = ref(null)

// Internal HSV state
const h = ref(0)
const s = ref(1)
const v = ref(1)
const hexInput = ref(props.modelValue || '#000000')

let draggingSV = false, draggingH = false

watch(() => props.modelValue, (hex) => {
  if (!hex) return
  const { r, g, b } = hexToRgb(hex)
  const hsv = rgbToHsv(r, g, b)
  h.value = hsv.h; s.value = hsv.s; v.value = hsv.v
  hexInput.value = hex
}, { immediate: true })

const currentHex = computed(() => {
  const { r, g, b } = hsvToRgb(h.value, s.value, v.value)
  return rgbToHex(r, g, b)
})

watch(currentHex, (hex) => {
  hexInput.value = hex
  emit('update:modelValue', hex)
})

function drawSV() {
  const canvas = svCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const w = canvas.width, ht = canvas.height
  const hueColor = `hsl(${h.value}, 100%, 50%)`
  const whiteGrad = ctx.createLinearGradient(0, 0, w, 0)
  whiteGrad.addColorStop(0, 'white'); whiteGrad.addColorStop(1, hueColor)
  ctx.fillStyle = whiteGrad; ctx.fillRect(0, 0, w, ht)
  const blackGrad = ctx.createLinearGradient(0, 0, 0, ht)
  blackGrad.addColorStop(0, 'transparent'); blackGrad.addColorStop(1, 'black')
  ctx.fillStyle = blackGrad; ctx.fillRect(0, 0, w, ht)
  // Cursor
  const cx = s.value * w, cy = (1 - v.value) * ht
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke()
}

function drawHue() {
  const canvas = hueCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const ht = canvas.height
  const grad = ctx.createLinearGradient(0, 0, 0, ht)
  for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`)
  ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, ht)
  // Cursor
  const cy = (h.value / 360) * ht
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1
  ctx.fillRect(0, cy - 3, canvas.width, 6)
  ctx.strokeRect(0, cy - 3, canvas.width, 6)
}

watch([h, s, v], () => { drawSV(); drawHue() })
onMounted(() => { drawSV(); drawHue() })

function onSVMouseDown(e) {
  draggingSV = true; pickSV(e)
}
function onSVMouseMove(e) { if (draggingSV) pickSV(e) }
function onSVMouseUp() { draggingSV = false }
function pickSV(e) {
  const rect = svCanvas.value.getBoundingClientRect()
  s.value = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  v.value = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
}

function onHueMouseDown(e) { draggingH = true; pickHue(e) }
function onHueMouseMove(e) { if (draggingH) pickHue(e) }
function onHueMouseUp() { draggingH = false }
function pickHue(e) {
  const rect = hueCanvas.value.getBoundingClientRect()
  h.value = Math.max(0, Math.min(360, (e.clientY - rect.top) / rect.height * 360))
}

function onHexInput(v) {
  if (/^#[0-9a-f]{6}$/i.test(v)) {
    const rgb = hexToRgb(v)
    const hsv2 = rgbToHsv(rgb.r, rgb.g, rgb.b)
    h.value = hsv2.h; s.value = hsv2.s; v.value = hsv2.v
    emit('update:modelValue', v)
  }
}
</script>

<template>
  <div class="color-picker" @mousemove.prevent @mouseup.prevent>
    <div class="picker-top">
      <canvas ref="svCanvas" width="200" height="180" class="sv-canvas"
        @mousedown.prevent="onSVMouseDown"
        @mousemove.prevent="onSVMouseMove"
        @mouseup.prevent="onSVMouseUp" />
      <canvas ref="hueCanvas" width="20" height="180" class="hue-canvas"
        @mousedown.prevent="onHueMouseDown"
        @mousemove.prevent="onHueMouseMove"
        @mouseup.prevent="onHueMouseUp" />
    </div>
    <div class="picker-bottom">
      <div class="color-preview" :style="{ background: currentHex }" />
      <v-text-field
        :model-value="hexInput"
        @update:model-value="onHexInput"
        density="compact" variant="outlined" hide-details
        style="max-width:110px; font-size:12px"
        prefix="#"
      />
    </div>
  </div>
</template>

<style scoped>
.color-picker { user-select: none; }
.picker-top { display: flex; gap: 6px; margin-bottom: 8px; }
.sv-canvas { cursor: crosshair; border-radius: 4px; }
.hue-canvas { cursor: ns-resize; border-radius: 4px; }
.picker-bottom { display: flex; align-items: center; gap: 8px; }
.color-preview { width: 32px; height: 32px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0; }
</style>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({ layer: { type: Object, required: true } })
const thumbCanvas = ref(null)
let debounceTimer = null

function draw() {
  const canvas = thumbCanvas.value
  if (!canvas || !props.layer?.canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 40, 40)
  // Checkerboard
  for (let y = 0; y < 40; y += 8) {
    for (let x = 0; x < 40; x += 8) {
      ctx.fillStyle = ((x + y) / 8 % 2 === 0) ? '#ccc' : '#fff'
      ctx.fillRect(x, y, Math.min(8, 40 - x), Math.min(8, 40 - y))
    }
  }
  // Layer content (fit to 40x40)
  const lw = props.layer.canvas.width, lh = props.layer.canvas.height
  const scale = Math.min(40 / lw, 40 / lh)
  const dw = lw * scale, dh = lh * scale
  const dx = (40 - dw) / 2, dy = (40 - dh) / 2
  ctx.drawImage(props.layer.canvas, dx, dy, dw, dh)
}

function scheduleDraw() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(draw, 150)
}

watch(() => props.layer, scheduleDraw, { deep: false })
watch(() => props.layer?.canvas, draw)
onMounted(draw)
defineExpose({ refresh: draw })
</script>

<template>
  <canvas ref="thumbCanvas" width="40" height="40" class="layer-thumb" />
</template>

<style scoped>
.layer-thumb {
  border-radius: 3px;
  flex-shrink: 0;
  background: #ccc;
}
</style>

<script setup>
import { ref, inject, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const { invalidate } = inject('editorInvalidateObj')
const { t } = useI18n()

const angle = ref(0)
const flipH = ref(false)
const flipV = ref(false)

function rotateCanvas90(times) {
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) {
    const ow = state.canvasWidth, oh = state.canvasHeight
    for (const layer of state.layers) {
      const newCanvas = markRaw(new OffscreenCanvas(oh, ow))
      const ctx = newCanvas.getContext('2d', { willReadFrequently: true })
      ctx.translate(oh / 2, ow / 2)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(layer.canvas, -ow / 2, -oh / 2)
      layer.canvas = newCanvas
    }
    state.canvasWidth = oh; state.canvasHeight = ow
  }
}

function applyFlip(horizontal) {
  for (const layer of state.layers) {
    const newCanvas = markRaw(new OffscreenCanvas(layer.canvas.width, layer.canvas.height))
    const ctx = newCanvas.getContext('2d', { willReadFrequently: true })
    if (horizontal) { ctx.translate(layer.canvas.width, 0); ctx.scale(-1, 1) }
    else { ctx.translate(0, layer.canvas.height); ctx.scale(1, -1) }
    ctx.drawImage(layer.canvas, 0, 0)
    layer.canvas = newCanvas
  }
}

function applyArbitrary(deg) {
  const rad = (deg * Math.PI) / 180
  const ow = state.canvasWidth, oh = state.canvasHeight
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad))
  const nw = Math.round(ow * cos + oh * sin)
  const nh = Math.round(ow * sin + oh * cos)
  for (const layer of state.layers) {
    const newCanvas = markRaw(new OffscreenCanvas(nw, nh))
    const ctx = newCanvas.getContext('2d', { willReadFrequently: true })
    ctx.translate(nw / 2, nh / 2)
    ctx.rotate(rad)
    ctx.drawImage(layer.canvas, -ow / 2, -oh / 2)
    layer.canvas = newCanvas
  }
  state.canvasWidth = nw; state.canvasHeight = nh
}

function apply() {
  if (angle.value !== 0) applyArbitrary(angle.value)
  if (flipH.value) applyFlip(true)
  if (flipV.value) applyFlip(false)
  pushHistory('Rotate Canvas', state)
  state.isDirty = true; invalidate()
  emit('update:modelValue', false)
  angle.value = 0; flipH.value = false; flipV.value = false
}

function rotate90(steps) {
  rotateCanvas90(steps)
  pushHistory(`Rotate ${steps * 90}°`, state)
  state.isDirty = true; invalidate()
}
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="380">
    <v-card>
      <v-card-title>{{ t('editor.rotateCanvas') }}</v-card-title>
      <v-card-text>
        <div class="quick-rotate mb-4">
          <v-btn size="small" variant="tonal" @click="rotate90(1)" class="mr-2">90° CW</v-btn>
          <v-btn size="small" variant="tonal" @click="rotate90(3)" class="mr-2">90° CCW</v-btn>
          <v-btn size="small" variant="tonal" @click="rotate90(2)">180°</v-btn>
        </div>
        <v-text-field v-model.number="angle" type="number" :label="t('editor.angle')" suffix="°" density="compact" variant="outlined" hide-details class="mb-3" />
        <v-checkbox v-model="flipH" :label="t('editor.flipHorizontal')" density="compact" hide-details />
        <v-checkbox v-model="flipV" :label="t('editor.flipVertical')" density="compact" hide-details />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('editor.cancel') }}</v-btn>
        <v-btn variant="tonal" color="primary" @click="apply" :disabled="!angle && !flipH && !flipV">{{ t('editor.apply') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.quick-rotate { display: flex; align-items: center; }
</style>

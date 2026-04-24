<script setup>
import { ref, inject, watch, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const { invalidate } = inject('editorInvalidateObj')
const { t } = useI18n()

const w = ref(state.canvasWidth)
const h = ref(state.canvasHeight)
const lock = ref(true)

function onWChange() {
  if (lock.value && state.canvasWidth) h.value = Math.round(w.value * state.canvasHeight / state.canvasWidth)
}
function onHChange() {
  if (lock.value && state.canvasHeight) w.value = Math.round(h.value * state.canvasWidth / state.canvasHeight)
}

function apply() {
  const nw = Math.max(1, Math.round(w.value))
  const nh = Math.max(1, Math.round(h.value))
  pushHistory('Image Resize', state)
  for (const layer of state.layers) {
    const newCanvas = markRaw(new OffscreenCanvas(nw, nh))
    const ctx = newCanvas.getContext('2d')
    const scaleX = nw / state.canvasWidth, scaleY = nh / state.canvasHeight
    ctx.drawImage(layer.canvas, layer.offsetX * scaleX, layer.offsetY * scaleY, layer.canvas.width * scaleX, layer.canvas.height * scaleY)
    layer.canvas = newCanvas
    layer.offsetX = 0; layer.offsetY = 0
  }
  state.canvasWidth = nw; state.canvasHeight = nh
  state.isDirty = true; invalidate()
  emit('update:modelValue', false)
}

watch(() => props.modelValue, (v) => { if (v) { w.value = state.canvasWidth; h.value = state.canvasHeight } })
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="360">
    <v-card>
      <v-card-title>{{ t('editor.imageResize') }}</v-card-title>
      <v-card-text>
        <v-row dense align="center">
          <v-col cols="5">
            <v-text-field v-model.number="w" type="number" :label="t('editor.width')" density="compact" variant="outlined" hide-details suffix="px" @update:model-value="onWChange" />
          </v-col>
          <v-col cols="2" class="text-center">
            <v-btn icon size="small" :variant="lock ? 'tonal' : 'text'" @click="lock = !lock">
              <v-icon>{{ lock ? 'mdi-link' : 'mdi-link-off' }}</v-icon>
            </v-btn>
          </v-col>
          <v-col cols="5">
            <v-text-field v-model.number="h" type="number" :label="t('editor.height')" density="compact" variant="outlined" hide-details suffix="px" @update:model-value="onHChange" />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('editor.cancel') }}</v-btn>
        <v-btn variant="tonal" color="primary" @click="apply">{{ t('editor.apply') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

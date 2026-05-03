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
const anchor = ref('center')  // 'nw'|'n'|'ne'|'w'|'center'|'e'|'sw'|'s'|'se'

const ANCHORS = [
  ['nw','n','ne'],
  ['w','center','e'],
  ['sw','s','se'],
]

function apply() {
  const nw = Math.max(1, Math.round(w.value))
  const nh = Math.max(1, Math.round(h.value))
  const ow = state.canvasWidth, oh = state.canvasHeight
  let ox = 0, oy = 0
  if (anchor.value.includes('e')) ox = nw - ow
  else if (anchor.value === 'center' || anchor.value === 'n' || anchor.value === 's') ox = (nw - ow) / 2
  if (anchor.value.includes('s')) oy = nh - oh
  else if (anchor.value === 'center' || anchor.value === 'w' || anchor.value === 'e') oy = (nh - oh) / 2

  for (const layer of state.layers) {
    const newCanvas = markRaw(new OffscreenCanvas(nw, nh))
    newCanvas.getContext('2d', { willReadFrequently: true }).drawImage(layer.canvas, ox, oy)
    layer.canvas = newCanvas
  }
  state.canvasWidth = nw; state.canvasHeight = nh
  pushHistory('Canvas Resize', state)
  state.isDirty = true
  invalidate()
  emit('update:modelValue', false)
}

watch(() => props.modelValue, (v) => { if (v) { w.value = state.canvasWidth; h.value = state.canvasHeight } })
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="360">
    <v-card>
      <v-card-title>{{ t('editor.canvasResize') }}</v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col cols="6">
            <v-text-field v-model.number="w" type="number" :label="t('editor.width')" density="compact" variant="outlined" hide-details suffix="px" />
          </v-col>
          <v-col cols="6">
            <v-text-field v-model.number="h" type="number" :label="t('editor.height')" density="compact" variant="outlined" hide-details suffix="px" />
          </v-col>
        </v-row>
        <div class="anchor-grid mt-4">
          <span class="text-caption text-medium-emphasis mb-1">{{ t('editor.anchor') }}</span>
          <div class="grid3x3">
            <div v-for="row in ANCHORS" :key="row[0]" class="grid-row">
              <div v-for="a in row" :key="a" class="anchor-cell" :class="{ active: anchor === a }" @click="anchor = a" />
            </div>
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('editor.cancel') }}</v-btn>
        <v-btn variant="tonal" color="primary" @click="apply">{{ t('editor.apply') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.anchor-grid { display: flex; flex-direction: column; align-items: center; }
.grid3x3 { border: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 2)); border-radius: 4px; overflow: hidden; }
.grid-row { display: flex; }
.anchor-cell { width: 24px; height: 24px; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); cursor: pointer; background: rgba(var(--v-theme-on-surface), 0.05); transition: background 0.15s; }
.anchor-cell:hover { background: rgba(var(--v-theme-on-surface), 0.12); }
.anchor-cell.active { background: rgb(var(--v-theme-primary)); }
</style>

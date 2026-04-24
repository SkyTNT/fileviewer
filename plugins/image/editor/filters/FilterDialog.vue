<script setup>
import { ref, inject, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getActiveLayer } from '../editorState.js'
import { runFilter, previewFilter } from './filterRunner.js'

const props = defineProps({
  modelValue: { type: [Boolean, Object], default: null },
  filterId: String,
  filterLabel: String,
  params: { type: Array, default: () => [] },
  // params: [{ key, label, min, max, step, default }]
})
const emit = defineEmits(['update:modelValue'])

const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const { invalidate } = inject('editorInvalidateObj')
const editorApi = inject('editorApi')
const { t } = useI18n()

const values = ref({})
let _previewSrc = null

onMounted(() => {
  const v = {}
  for (const p of props.params) v[p.key] = p.default ?? 0
  values.value = v
})

watch(values, async () => {
  const layer = getActiveLayer(state)
  if (!layer) return
  if (!_previewSrc) _previewSrc = layer.canvas.getContext('2d').getImageData(0, 0, layer.canvas.width, layer.canvas.height)
  layer.canvas.getContext('2d').putImageData(_previewSrc, 0, 0)
  await runFilter(props.filterId, values.value, layer, editorApi, false)
  invalidate()
}, { deep: true })

async function apply() {
  const layer = getActiveLayer(state)
  if (!layer) { close(); return }
  pushHistory(props.filterLabel, state)
  if (_previewSrc) layer.canvas.getContext('2d').putImageData(_previewSrc, 0, 0)
  await runFilter(props.filterId, values.value, layer, editorApi)
  state.isDirty = true
  invalidate()
  close()
}

function cancel() {
  const layer = getActiveLayer(state)
  if (layer && _previewSrc) { layer.canvas.getContext('2d').putImageData(_previewSrc, 0, 0); invalidate() }
  close()
}

function close() {
  _previewSrc = null
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="cancel" max-width="380">
    <v-card>
      <v-card-title>{{ filterLabel }}</v-card-title>
      <v-card-text>
        <div v-for="p in params" :key="p.key" class="filter-row">
          <span class="filter-label">{{ p.label }}</span>
          <v-slider
            v-model="values[p.key]"
            :min="p.min" :max="p.max" :step="p.step || 1"
            hide-details density="compact" class="flex-grow-1"
          />
          <span class="filter-val">{{ typeof values[p.key] === 'number' ? values[p.key].toFixed(p.step < 1 ? 2 : 0) : values[p.key] }}</span>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="cancel">{{ t('editor.cancel') }}</v-btn>
        <v-btn variant="tonal" color="primary" @click="apply">{{ t('editor.apply') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.filter-label { font-size: 12px; width: 90px; flex-shrink: 0; }
.filter-val { font-size: 12px; width: 40px; text-align: right; flex-shrink: 0; }
</style>

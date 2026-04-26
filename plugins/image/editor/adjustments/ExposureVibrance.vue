<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { exposure, vibrance } from '../filters/clientFilters.js'
import { applyFilterWithSelection } from '../filters/filterRunner.js'
import { useAdjustment } from './useAdjustment.js'

const { t } = useI18n()
const exp = ref(0)
const vib = ref(0)

const { preview, apply, cancel } = useAdjustment(
  'Exposure/Vibrance',
  (layer, sel) => {
    applyFilterWithSelection(exposure, layer.canvas, { value: exp.value }, sel)
    applyFilterWithSelection(vibrance, layer.canvas, { value: vib.value }, sel)
  },
  () => { exp.value = 0; vib.value = 0 }
)
</script>

<template>
  <div class="adj-panel">
    <div class="adj-row">
      <span class="adj-label">{{ t('editor.exposure') }}</span>
      <v-slider v-model="exp" :min="-3" :max="3" :step="0.1" hide-details density="compact" class="flex-grow-1" @update:model-value="preview" />
      <span class="adj-val">{{ exp.toFixed(1) }}</span>
    </div>
    <div class="adj-row">
      <span class="adj-label">{{ t('editor.vibrance') }}</span>
      <v-slider v-model="vib" :min="-1" :max="1" :step="0.01" hide-details density="compact" class="flex-grow-1" @update:model-value="preview" />
      <span class="adj-val">{{ Math.round(vib * 100) }}</span>
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
.adj-val { font-size: 11px; color: rgba(255,255,255,0.8); width: 36px; text-align: right; flex-shrink: 0; }
.adj-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 6px; }
</style>

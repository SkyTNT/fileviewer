<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { shadows_highlights } from '../filters/clientFilters.js'
import { applyFilterWithSelection } from '../filters/filterRunner.js'
import { useAdjustment } from './useAdjustment.js'

const { t } = useI18n()
const shadows = ref(0)
const highlights = ref(0)

const { preview, apply, cancel } = useAdjustment(
  'Shadows/Highlights',
  (layer, sel) => applyFilterWithSelection(shadows_highlights, layer.canvas, { shadows: shadows.value, highlights: highlights.value }, sel),
  () => { shadows.value = 0; highlights.value = 0 }
)
</script>

<template>
  <div class="adj-panel">
    <div class="adj-row">
      <span class="adj-label">{{ t('editor.shadows') }}</span>
      <v-slider v-model="shadows" :min="-1" :max="1" :step="0.01" hide-details density="compact" class="flex-grow-1" @update:model-value="preview" />
      <span class="adj-val">{{ Math.round(shadows * 100) }}</span>
    </div>
    <div class="adj-row">
      <span class="adj-label">{{ t('editor.highlights') }}</span>
      <v-slider v-model="highlights" :min="-1" :max="1" :step="0.01" hide-details density="compact" class="flex-grow-1" @update:model-value="preview" />
      <span class="adj-val">{{ Math.round(highlights * 100) }}</span>
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

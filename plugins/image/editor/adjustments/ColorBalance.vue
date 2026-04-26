<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { color_balance } from '../filters/clientFilters.js'
import { applyFilterWithSelection } from '../filters/filterRunner.js'
import { useAdjustment } from './useAdjustment.js'

const { t } = useI18n()
const shadows = ref([0, 0, 0])
const midtones = ref([0, 0, 0])
const highlights = ref([0, 0, 0])
const zone = ref('midtones')

const zoneArr = computed(() =>
  zone.value === 'shadows' ? shadows : zone.value === 'highlights' ? highlights : midtones
)

const { preview, apply, cancel } = useAdjustment(
  'Color Balance',
  (layer, sel) => applyFilterWithSelection(color_balance, layer.canvas, { shadows: shadows.value, midtones: midtones.value, highlights: highlights.value }, sel),
  () => { shadows.value = [0,0,0]; midtones.value = [0,0,0]; highlights.value = [0,0,0] }
)

const channels = ['R', 'G', 'B']
</script>

<template>
  <div class="adj-panel">
    <v-btn-toggle v-model="zone" density="compact" rounded="lg" mandatory class="mb-2">
      <v-btn value="shadows" size="x-small">{{ t('editor.shadows') }}</v-btn>
      <v-btn value="midtones" size="x-small">{{ t('editor.midtones') }}</v-btn>
      <v-btn value="highlights" size="x-small">{{ t('editor.highlights') }}</v-btn>
    </v-btn-toggle>
    <div v-for="(ch, ci) in channels" :key="ch" class="adj-row">
      <span class="adj-label">{{ ch }}</span>
      <v-slider
        v-model="zoneArr.value[ci]"
        @update:model-value="preview"
        :min="-100" :max="100" :step="1" hide-details density="compact" class="flex-grow-1"
      />
      <span class="adj-val">{{ zoneArr.value[ci] }}</span>
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
.adj-label { font-size: 11px; color: rgba(255,255,255,0.6); width: 20px; flex-shrink: 0; }
.adj-val { font-size: 11px; color: rgba(255,255,255,0.8); width: 36px; text-align: right; flex-shrink: 0; }
.adj-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 6px; }
</style>

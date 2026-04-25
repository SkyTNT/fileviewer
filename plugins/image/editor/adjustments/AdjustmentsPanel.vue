<script setup>
import { ref, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { getActiveLayer } from '../editorState.js'
import { runFilter } from '../filters/filterRunner.js'
import BrightnessContrast from './BrightnessContrast.vue'
import HueSaturation from './HueSaturation.vue'
import ColorBalance from './ColorBalance.vue'
import ExposureVibrance from './ExposureVibrance.vue'
import ShadowsHighlights from './ShadowsHighlights.vue'
import LevelsDialog from './LevelsDialog.vue'
import CurvesDialog from './CurvesDialog.vue'

const state = inject('editorState')
const { pushHistory } = inject('editorHistory')
const { invalidate } = inject('editorInvalidateObj')
const editorApi = inject('editorApi')
const { t } = useI18n()

const open = ref([])

// Filter shortcuts accessible from the panel
async function applyFilter(filterId, params) {
  const layer = getActiveLayer(state)
  if (!layer || layer.locked) return
  await runFilter(filterId, params, layer, editorApi, null, state.selection)
  pushHistory(filterId, state)
  state.isDirty = true
  invalidate()
}
</script>

<template>
  <div class="adjustments-panel">
    <v-expansion-panels v-model="open" multiple variant="accordion" density="compact">
      <!-- Adjustments -->
      <v-expansion-panel value="bc">
        <v-expansion-panel-title class="panel-title-sm">{{ t('editor.brightnessContrast') }}</v-expansion-panel-title>
        <v-expansion-panel-text><BrightnessContrast /></v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel value="hsl">
        <v-expansion-panel-title class="panel-title-sm">{{ t('editor.hueSaturation') }}</v-expansion-panel-title>
        <v-expansion-panel-text><HueSaturation /></v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel value="cb">
        <v-expansion-panel-title class="panel-title-sm">{{ t('editor.colorBalance') }}</v-expansion-panel-title>
        <v-expansion-panel-text><ColorBalance /></v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel value="ev">
        <v-expansion-panel-title class="panel-title-sm">{{ t('editor.exposureVibrance') }}</v-expansion-panel-title>
        <v-expansion-panel-text><ExposureVibrance /></v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel value="sh">
        <v-expansion-panel-title class="panel-title-sm">{{ t('editor.shadowsHighlights') }}</v-expansion-panel-title>
        <v-expansion-panel-text><ShadowsHighlights /></v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel value="levels">
        <v-expansion-panel-title class="panel-title-sm">{{ t('editor.levels') }}</v-expansion-panel-title>
        <v-expansion-panel-text><LevelsDialog /></v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel value="curves">
        <v-expansion-panel-title class="panel-title-sm">{{ t('editor.curves') }}</v-expansion-panel-title>
        <v-expansion-panel-text><CurvesDialog /></v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Quick filters -->
      <v-expansion-panel value="filters">
        <v-expansion-panel-title class="panel-title-sm">{{ t('editor.quickFilters') }}</v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="quick-filters">
            <v-btn size="x-small" variant="tonal" class="ma-1" @click="applyFilter('grayscale', {})">{{ t('editor.grayscale') }}</v-btn>
            <v-btn size="x-small" variant="tonal" class="ma-1" @click="applyFilter('sepia', {})">{{ t('editor.sepia') }}</v-btn>
            <v-btn size="x-small" variant="tonal" class="ma-1" @click="applyFilter('invert', {})">{{ t('editor.invert') }}</v-btn>
            <v-btn size="x-small" variant="tonal" class="ma-1" @click="applyFilter('emboss', {})">{{ t('editor.emboss') }}</v-btn>
            <v-btn size="x-small" variant="tonal" class="ma-1" @click="applyFilter('edge_detect', {})">{{ t('editor.edgeDetect') }}</v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<style scoped>
.adjustments-panel { overflow-y: auto; flex: 1; }
.panel-title-sm { font-size: 12px !important; min-height: 36px !important; padding: 0 12px !important; }
.quick-filters { display: flex; flex-wrap: wrap; padding: 4px; }
</style>

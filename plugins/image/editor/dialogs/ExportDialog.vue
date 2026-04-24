<script setup>
import { ref, inject, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { flattenToBlob } from '../canvas/LayerCompositor.js'

const props = defineProps({ modelValue: Boolean, filePath: String })
const emit = defineEmits(['update:modelValue'])
const state = inject('editorState')
const { t } = useI18n()

const format = ref('image/png')
const quality = ref(0.92)
const saving = ref(false)
const error = ref('')

const FORMATS = [
  { label: 'PNG (lossless)', value: 'image/png' },
  { label: 'JPEG (lossy)', value: 'image/jpeg' },
  { label: 'WebP', value: 'image/webp' },
]

const showQuality = computed(() => format.value !== 'image/png')

function ext(mime) {
  return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime] || 'png'
}

async function doExport() {
  saving.value = true; error.value = ''
  try {
    const blob = await flattenToBlob(state.layers, state.canvasWidth, state.canvasHeight, format.value, quality.value)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const baseName = props.filePath?.split('/').pop()?.replace(/\.[^.]+$/, '') || 'export'
    a.href = url; a.download = `${baseName}.${ext(format.value)}`
    a.click()
    URL.revokeObjectURL(url)
    emit('update:modelValue', false)
  } catch (e) {
    error.value = String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="380">
    <v-card>
      <v-card-title>{{ t('editor.export') }}</v-card-title>
      <v-card-text>
        <v-select v-model="format" :items="FORMATS" item-title="label" item-value="value" :label="t('editor.format')" density="compact" variant="outlined" hide-details class="mb-3" />
        <template v-if="showQuality">
          <span class="text-caption text-medium-emphasis">{{ t('editor.quality') }} {{ Math.round(quality * 100) }}%</span>
          <v-slider v-model="quality" :min="0.1" :max="1" :step="0.01" hide-details density="compact" />
        </template>
        <div class="text-caption text-medium-emphasis mt-2">
          {{ state.canvasWidth }} × {{ state.canvasHeight }} px
        </div>
        <v-alert v-if="error" type="error" density="compact" class="mt-2">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('editor.cancel') }}</v-btn>
        <v-btn variant="tonal" color="primary" :loading="saving" @click="doExport">{{ t('editor.export') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

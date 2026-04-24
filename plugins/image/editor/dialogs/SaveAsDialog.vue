<script setup>
import { ref, inject, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({ modelValue: Boolean, filePath: String })
const emit = defineEmits(['update:modelValue', 'saved'])
const state = inject('editorState')
const editorApi = inject('editorApi')
const { t } = useI18n()

const filename = ref('')
const saving = ref(false)
const error = ref('')

watch(() => props.modelValue, (v) => {
  if (v) {
    const base = props.filePath?.split('/').pop() || 'image.png'
    filename.value = base.replace(/\.[^.]+$/, '') + '_copy.' + (base.split('.').pop() || 'png')
    error.value = ''
  }
})

async function save() {
  saving.value = true; error.value = ''
  try {
    const { flattenToBlob } = await import('../canvas/LayerCompositor.js')
    const format = filename.value.endsWith('.jpg') || filename.value.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'
    const blob = await flattenToBlob(state.layers, state.canvasWidth, state.canvasHeight, format)
    const parentPath = props.filePath?.split('/').slice(0, -1).join('/') || ''
    const result = await editorApi.saveImageAs(parentPath, filename.value, blob)
    emit('saved', result.path)
    emit('update:modelValue', false)
  } catch (e) {
    error.value = String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="400">
    <v-card>
      <v-card-title>{{ t('editor.saveAs') }}</v-card-title>
      <v-card-text>
        <v-text-field v-model="filename" :label="t('editor.filename')" density="compact" variant="outlined" hide-details autofocus @keydown.enter="save" />
        <v-alert v-if="error" type="error" density="compact" class="mt-2">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('editor.cancel') }}</v-btn>
        <v-btn variant="tonal" color="primary" :loading="saving" @click="save">{{ t('editor.save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

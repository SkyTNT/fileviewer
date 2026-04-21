<script setup>
import { useI18n } from 'vue-i18n'

const props = defineProps({
  title:       { type: String,  default: '' },
  label:       { type: String,  default: '' },
  name:        { type: String,  default: '' },
  loading:     { type: Boolean, default: false },
  error:       { type: String,  default: '' },
  confirmText: { type: String,  default: undefined },
  winId:       { type: String,  default: null },
  winManager:  { type: Object,  default: null },
})
const emit = defineEmits(['update:name', 'confirm'])

const { t } = useI18n()

function close() { props.winManager?.close(props.winId) }
</script>

<template>
  <div class="pa-4 d-flex flex-column" style="height:100%">
    <v-text-field
      :model-value="name"
      :label="label"
      autofocus
      :error-messages="error"
      density="compact"
      variant="outlined"
      class="mb-2 flex-grow-0"
      @update:model-value="emit('update:name', $event)"
      @keydown.enter="emit('confirm')"
      @keydown.esc="close"
    />
    <div class="d-flex justify-end ga-2 mt-auto">
      <v-btn variant="text" @click="close">{{ t('dialog.cancel') }}</v-btn>
      <v-btn color="primary" :loading="loading" @click="emit('confirm')">
        {{ confirmText ?? t('dialog.create') }}
      </v-btn>
    </div>
  </div>
</template>

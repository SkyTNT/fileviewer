<script setup>
import { useI18n } from 'vue-i18n'
import BaseDialog from './BaseDialog.vue'

defineProps({
  modelValue: Boolean,
  name:       { type: String,  default: '' },
  loading:    { type: Boolean, default: false },
  error:      { type: String,  default: '' },
})
defineEmits(['update:modelValue', 'update:name', 'confirm'])

const { t } = useI18n()
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    :title="t('dialog.renameTitle')"
    :confirm-text="t('dialog.rename')"
    :confirm-loading="loading"
    @update:model-value="$emit('update:modelValue', $event)"
    @confirm="$emit('confirm')"
  >
    <v-text-field
      :model-value="name"
      :label="t('dialog.newName')"
      autofocus
      :error-messages="error"
      @update:model-value="$emit('update:name', $event)"
      @keydown.enter="$emit('confirm')"
    />
  </BaseDialog>
</template>

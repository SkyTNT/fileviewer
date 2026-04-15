<script setup>
import { useI18n } from 'vue-i18n'
import BaseDialog from './BaseDialog.vue'

const { t } = useI18n()

defineProps({
  modelValue:  Boolean,
  title:       { type: String,  default: '' },
  label:       { type: String,  default: '' },
  name:        { type: String,  default: '' },
  loading:     { type: Boolean, default: false },
  error:       { type: String,  default: '' },
  confirmText: { type: String,  default: undefined },
})
defineEmits(['update:modelValue', 'update:name', 'confirm'])
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    :title="title"
    :confirm-text="confirmText ?? t('dialog.create')"
    :confirm-loading="loading"
    @update:model-value="$emit('update:modelValue', $event)"
    @confirm="$emit('confirm')"
  >
    <v-text-field
      :model-value="name"
      :label="label"
      autofocus
      :error-messages="error"
      @update:model-value="$emit('update:name', $event)"
      @keydown.enter="$emit('confirm')"
    />
  </BaseDialog>
</template>

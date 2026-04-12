<script setup>
import { useI18n } from 'vue-i18n'
import BaseDialog from './BaseDialog.vue'

defineProps({
  modelValue: Boolean,
  title:      { type: String,  default: '' },
  label:      { type: String,  default: '' },
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
    :title="title"
    :confirm-text="t('dialog.create')"
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

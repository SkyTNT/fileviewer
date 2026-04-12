<script setup>
import { useI18n } from 'vue-i18n'

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
  <v-dialog :model-value="modelValue" max-width="360"
            @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="pa-4">{{ t('dialog.renameTitle') }}</v-card-title>
      <v-card-text class="pt-0">
        <v-text-field
          :model-value="name"
          :label="t('dialog.newName')"
          autofocus
          :error-messages="error"
          @update:model-value="$emit('update:name', $event)"
          @keydown.enter="$emit('confirm')"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('dialog.cancel') }}</v-btn>
        <v-btn color="primary" :loading="loading" @click="$emit('confirm')">{{ t('dialog.rename') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

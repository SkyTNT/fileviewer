<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  modelValue: Boolean,
  count:      { type: Number, default: 0 },
})
defineEmits(['update:modelValue', 'confirm'])

const { t } = useI18n()
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="400"
            @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="pa-4">{{ t('dialog.deleteTitleN', { n: count }) }}</v-card-title>
      <v-card-text class="pt-0">
        {{ t('dialog.confirmDeleteMulti', { n: count }) }}
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('dialog.cancel') }}</v-btn>
        <v-btn color="error" @click="$emit('confirm')">{{ t('dialog.delete') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

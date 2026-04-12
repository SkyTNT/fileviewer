<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  modelValue:     Boolean,
  title:          { type: String,          default: '' },
  maxWidth:       { type: [String, Number], default: 360 },
  confirmText:    { type: String,          default: '' },
  confirmColor:   { type: String,          default: 'primary' },
  confirmLoading: { type: Boolean,         default: false },
})
defineEmits(['update:modelValue', 'confirm'])

const { t } = useI18n()
</script>

<template>
  <v-dialog :model-value="modelValue" :max-width="maxWidth"
            @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="pa-4">{{ title }}</v-card-title>
      <v-card-text class="pt-0">
        <slot />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('dialog.cancel') }}</v-btn>
        <v-btn :color="confirmColor" :loading="confirmLoading" @click="$emit('confirm')">
          {{ confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

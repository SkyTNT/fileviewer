<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  modelValue: Boolean,
  targets:    { type: Array, default: () => [] },
})
defineEmits(['update:modelValue', 'confirm'])

const { t } = useI18n()
</script>

<template>
  <v-dialog :model-value="modelValue" :max-width="targets.length === 1 ? 360 : 400"
            @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="pa-4">
        {{ targets.length > 1 ? t('dialog.deleteTitleN', { n: targets.length }) : t('dialog.deleteTitle') }}
      </v-card-title>
      <v-card-text class="pt-0">
        <template v-if="targets.length === 1">
          <i18n-t keypath="dialog.confirmDeleteSingle" tag="span">
            <template #name><strong>{{ targets[0]?.name }}</strong></template>
          </i18n-t>
          <span v-if="targets[0]?.is_dir" class="text-error d-block mt-1 text-body-2">
            {{ t('dialog.folderWarning') }}
          </span>
        </template>
        <template v-else>
          {{ t('dialog.confirmDeleteMulti', { n: targets.length }) }}
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('dialog.cancel') }}</v-btn>
        <v-btn color="error" @click="$emit('confirm')">{{ t('dialog.delete') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

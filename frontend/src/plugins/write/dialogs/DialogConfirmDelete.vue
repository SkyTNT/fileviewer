<script setup>
import { useI18n } from 'vue-i18n'
import BaseDialog from './BaseDialog.vue'

const props = defineProps({
  modelValue: Boolean,
  targets:    { type: Array, default: () => [] },
})
defineEmits(['update:modelValue', 'confirm'])

const { t } = useI18n()
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    :title="props.targets.length > 1 ? t('dialog.deleteTitleN', { n: props.targets.length }) : t('dialog.deleteTitle')"
    :max-width="props.targets.length === 1 ? 360 : 400"
    confirm-color="error"
    :confirm-text="t('dialog.delete')"
    @update:model-value="$emit('update:modelValue', $event)"
    @confirm="$emit('confirm')"
  >
    <template v-if="props.targets.length === 1">
      <i18n-t keypath="dialog.confirmDeleteSingle" tag="span">
        <template #name><strong>{{ props.targets[0]?.name }}</strong></template>
      </i18n-t>
      <span v-if="props.targets[0]?.is_dir" class="text-error d-block mt-1 text-body-2">
        {{ t('dialog.folderWarning') }}
      </span>
    </template>
    <template v-else>
      {{ t('dialog.confirmDeleteMulti', { n: props.targets.length }) }}
    </template>
  </BaseDialog>
</template>

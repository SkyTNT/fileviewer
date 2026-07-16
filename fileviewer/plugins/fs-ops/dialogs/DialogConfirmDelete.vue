<script setup>
import { useI18n } from 'vue-i18n'

const props = defineProps({
  targets:    { type: Array,  default: () => [] },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})
const emit = defineEmits(['confirm'])

const { t } = useI18n()

function close() { props.winManager?.close(props.winId) }
</script>

<template>
  <div class="pa-4 d-flex flex-column" style="height:100%">
    <div class="mb-4">
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
    </div>
    <div class="d-flex justify-end ga-2 mt-auto">
      <v-btn variant="text" @click="close">{{ t('dialog.cancel') }}</v-btn>
      <v-btn color="error" @click="emit('confirm')">{{ t('dialog.delete') }}</v-btn>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const props = defineProps({
  conflicts:  { type: Array,    required: true },
  onResolve:  { type: Function, required: true },
  winId:      { type: String,   default: null },
  winManager: { type: Object,   default: null },
})

const { t } = useI18n()

function resolve(strategy) {
  props.winManager?.close(props.winId)
  props.onResolve(strategy)
}

function cancel() {
  props.winManager?.close(props.winId)
  props.onResolve(null)
}
</script>

<template>
  <div class="pa-4 d-flex flex-column" style="height:100%">
    <p class="mb-3 text-body-2">
      {{ t('notify.alreadyExist', { n: conflicts.length }) }}
    </p>
    <v-list density="compact" class="rounded mb-3" max-height="160" style="overflow-y:auto">
      <v-list-item
        v-for="c in conflicts.slice(0, 100)"
        :key="c.name"
        :title="c.name"
        prepend-icon="mdi-file-outline"
      />
      <v-list-item
        v-if="conflicts.length > 100"
        :title="t('notify.andMore', { n: conflicts.length - 100 })"
      />
    </v-list>
    <p class="text-body-2 mb-4">{{ t('notify.whatToDo') }}</p>
    <div class="d-flex flex-wrap ga-2 mt-auto">
      <v-btn variant="text" @click="cancel">{{ t('notify.cancel') }}</v-btn>
      <v-spacer />
      <v-btn variant="tonal" @click="resolve('skip')">{{ t('notify.skip') }}</v-btn>
      <v-btn variant="tonal" color="warning" @click="resolve('coexist')">{{ t('notify.keepBoth') }}</v-btn>
      <v-btn variant="tonal" color="error" @click="resolve('overwrite')">{{ t('notify.overwrite') }}</v-btn>
    </div>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  file:       { type: Object, required: true },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})

const { t } = useI18n()
const appRegistry = inject('services').get('app.registry')

const apps = computed(() =>
  [...appRegistry.descriptors]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
)

function open(key) {
  props.winManager?.close(props.winId)
  appRegistry.open(props.file, { app: key })
}
</script>

<template>
  <v-list density="compact" nav style="height:100%;overflow-y:auto">
    <v-list-item
      v-for="app in apps"
      :key="app.key"
      :prepend-icon="app.icon ?? 'mdi-application-outline'"
      :title="app.key"
      :subtitle="app.match(file) ? t('openWith.matches') : ''"
      rounded="lg"
      @click="open(app.key)"
    />
  </v-list>
</template>

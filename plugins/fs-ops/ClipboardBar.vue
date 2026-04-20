<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const services    = inject('services')
const store       = services.get('explorer.state')
const writeStore  = services.get('write.store')
const { t } = useI18n()

const clipboardLabel = computed(() => {
  if (!store.clipboard) return ''
  const n = store.clipboard.entries.length
  return n > 1 ? t('toolbar.nItems', { n }) : store.clipboard.entries[0].name
})

const clipboardColor = computed(() => {
  const a = store.clipboard?.action
  return a === 'cut' ? 'warning' : a === 'link' ? 'success' : 'info'
})

const clipboardIcon = computed(() => {
  const a = store.clipboard?.action
  return a === 'cut' ? 'mdi-content-cut' : a === 'link' ? 'mdi-link-variant' : 'mdi-content-copy'
})
</script>

<template>
  <template v-if="store.clipboard && store.writeMode && !store.isAtHome">
    <v-chip
      size="x-small"
      :color="clipboardColor"
      variant="tonal"
      class="mr-1"
      closable
      @click:close="store.clearClipboard()"
    >
      <v-icon start size="14">{{ clipboardIcon }}</v-icon>
      {{ clipboardLabel }}
    </v-chip>
    <v-btn icon size="small" class="mr-1" color="primary" @click="writeStore.doPaste()">
      <v-icon size="20">mdi-content-paste</v-icon>
      <v-tooltip activator="parent">{{ t('action.paste') }}</v-tooltip>
    </v-btn>
  </template>
</template>

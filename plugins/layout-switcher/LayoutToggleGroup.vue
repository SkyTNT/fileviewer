<script setup>
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

const services       = inject('services')
const layoutRegistry = services.get('layout.registry')
const { t } = useI18n()
</script>

<template>
  <v-btn-toggle
    density="compact"
    rounded="lg"
    color="primary"
    class="mr-1"
  >
    <v-btn
      v-for="layout in layoutRegistry.layouts"
      :key="layout.key"
      size="small"
      :active="layoutRegistry.activeId === layout.key"
      @click="layoutRegistry.setActive(layout.key)"
    >
      <v-icon size="18">{{ layout.icon }}</v-icon>
      <v-tooltip activator="parent">{{ t(layout.label) }}</v-tooltip>
    </v-btn>
  </v-btn-toggle>
</template>

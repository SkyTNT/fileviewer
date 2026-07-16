<template>
  <v-app-bar density="compact" elevation="1">
    <ToolbarHost @toggle-sidebar="onToggleSidebar" />
    <v-progress-linear
      :active="store.loading"
      :indeterminate="store.loading"
      color="primary"
      absolute
      location="bottom"
    />
  </v-app-bar>
</template>

<script setup>
import { inject } from 'vue'
import ToolbarHost from './ToolbarHost.vue'

const store  = inject('services').get('explorer.state')
const events = inject('events')

function onToggleSidebar() {
  events?.emit('explorer:toggle-sidebar')
}
</script>

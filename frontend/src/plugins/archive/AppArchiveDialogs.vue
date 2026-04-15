<script setup>
import { useArchiveStore } from './store.js'
import DialogCompress        from './dialogs/DialogCompress.vue'
import DialogExtractProgress from './dialogs/DialogExtractProgress.vue'

const archiveStore = useArchiveStore()
</script>

<template>
  <DialogCompress v-model="archiveStore.compressDialog" :sources="archiveStore.compressSources" />
  <DialogExtractProgress />
</template>

<script setup>
import { ref, inject, onMounted, onUnmounted } from 'vue'

const services     = inject('services')
const events       = inject('events')
const explorerState = services.get('explorer.state')
const uploadStore  = services.get('upload.store')

const uploadInput = ref(null)

function onTrigger() {
  uploadInput.value.value = ''
  uploadInput.value.click()
}

function onFilesSelected(e) {
  const files = Array.from(e.target.files)
  if (files.length) uploadStore.addUploads(explorerState.currentPath, files)
}

onMounted(() => events.on('upload:trigger', onTrigger))
onUnmounted(() => events.off('upload:trigger', onTrigger))
</script>

<template>
  <input ref="uploadInput" type="file" multiple style="display:none" @change="onFilesSelected" />
</template>

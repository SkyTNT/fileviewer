<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { mediaApi } from '../../services/api.js'

const dialog = ref(false)
const file = ref(null)
const mediaEl = ref(null)

const isVideo = computed(() => {
  const ext = (file.value?.extension || '').toLowerCase()
  return ['.mp4', '.webm', '.ogv', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v', '.ts'].includes(ext)
})

const mediaUrl = computed(() =>
  file.value ? mediaApi.streamUrl(file.value.path) : ''
)

function open(f) {
  file.value = f
  dialog.value = true
  nextTick(() => {
    mediaEl.value?.load()
  })
}

function onClose() {
  mediaEl.value?.pause()
  dialog.value = false
}

watch(dialog, (val) => {
  if (!val) mediaEl.value?.pause()
})

defineExpose({ open })
</script>

<template>
  <v-dialog
    v-model="dialog"
    :max-width="isVideo ? 960 : 560"
    @click:outside="onClose"
  >
    <v-card>
      <v-card-title class="d-flex align-center pa-3">
        <v-icon class="mr-2">{{ isVideo ? 'mdi-play-circle-outline' : 'mdi-music-note' }}</v-icon>
        <span class="text-truncate" style="max-width: 80%">{{ file?.name }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="onClose" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 d-flex justify-center align-center">
        <video
          v-if="isVideo"
          ref="mediaEl"
          :src="mediaUrl"
          controls
          style="width: 100%; max-height: 70vh; background: #000; border-radius: 4px;"
        />
        <audio
          v-else
          ref="mediaEl"
          :src="mediaUrl"
          controls
          style="width: 100%;"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

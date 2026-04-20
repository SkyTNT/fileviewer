<script setup>
import { ref, computed, watch, nextTick, onMounted, inject } from 'vue'

const props = defineProps({
  file:       { type: Object, required: true },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})

const mediaApi = inject('services')?.get('media.api')

const mediaEl = ref(null)

const isVideo = computed(() => {
  const ext = (props.file?.extension || '').toLowerCase()
  return ['.mp4', '.webm', '.ogv', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v', '.ts'].includes(ext)
})

const mediaUrl = computed(() => props.file ? mediaApi.streamUrl(props.file.path) : '')

onMounted(() => nextTick(() => mediaEl.value?.load()))

watch(() => props.file, () => nextTick(() => mediaEl.value?.load()))
</script>

<template>
  <div class="media-app">
    <video
      v-if="isVideo"
      ref="mediaEl"
      :src="mediaUrl"
      controls
      class="media-el"
    />
    <audio
      v-else
      ref="mediaEl"
      :src="mediaUrl"
      controls
      class="audio-el"
    />
  </div>
</template>

<style scoped>
.media-app {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 16px;
  background: #000;
}
.media-el {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
.audio-el {
  width: 100%;
}
</style>

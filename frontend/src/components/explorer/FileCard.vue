<script setup>
import { computed } from 'vue'
import { imagesApi } from '../../services/api.js'
import { useFileStore } from '../../stores/fileStore.js'

const props = defineProps({
  file: { type: Object, required: true },
})
const emit  = defineEmits(['open', 'navigate'])
const store = useFileStore()

const isSelected = computed(() => store.selectedEntry?.path === props.file.path)

const isImage = computed(() => props.file.type === 'image')
const thumbnailUrl = computed(() =>
  isImage.value ? imagesApi.thumbnailUrl(props.file.path, 400) : null
)

const TYPE_ICON = {
  directory: 'mdi-folder',
  image:     'mdi-image-outline',
  parquet:   'mdi-table-large',
  json:      'mdi-code-json',
  jsonl:     'mdi-code-json',
  text:      'mdi-file-document-outline',
  unknown:   'mdi-file-outline',
}
const TYPE_COLOR = {
  directory: 'primary',
  image:     'success',
  parquet:   'warning',
  json:      'secondary',
  jsonl:     'secondary',
  text:      'info',
}

const typeIcon  = computed(() => TYPE_ICON[props.file.type]  || 'mdi-file-outline')
const typeColor = computed(() => TYPE_COLOR[props.file.type] || 'surface-variant')

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

let clickTimer = null

function onClick() {
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => store.selectEntry(props.file), 250)
}

function onDblClick() {
  clearTimeout(clickTimer)
  if (props.file.is_dir) emit('navigate', props.file.path)
  else emit('open', props.file)
}
</script>

<template>
  <v-card
    v-ripple
    class="file-card"
    rounded="lg"
    :elevation="isSelected ? 4 : 1"
    :class="{ 'file-card--selected': isSelected }"
    hover
    @click="onClick"
    @dblclick="onDblClick"
  >
    <!-- Image thumbnail -->
    <img
      v-if="isImage"
      :src="thumbnailUrl"
      :alt="file.name"
      loading="lazy"
      class="thumb-img"
    />

    <!-- Non-image icon area -->
    <div v-else class="icon-area d-flex flex-column align-center justify-center">
      <v-icon :color="typeColor" size="48">{{ typeIcon }}</v-icon>
      <v-chip
        class="mt-2"
        size="x-small"
        :color="typeColor"
        variant="tonal"
        label
      >
        {{ file.extension || file.type }}
      </v-chip>
    </div>

    <v-divider />

    <v-card-text class="py-2 px-3">
      <div class="text-body-2 font-weight-medium text-truncate" :title="file.name">
        {{ file.name }}
      </div>
      <div v-if="file.size != null" class="text-caption text-medium-emphasis">
        {{ formatSize(file.size) }}
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.file-card {
  break-inside: avoid;
  margin-bottom: 8px;
  cursor: pointer;
  transition: outline 0.1s;
}
.file-card--selected {
  outline: 2px solid rgb(var(--v-theme-primary));
}
.thumb-img {
  width: 100%;
  height: auto;
  display: block;
}
.icon-area {
  height: 110px;
}
</style>

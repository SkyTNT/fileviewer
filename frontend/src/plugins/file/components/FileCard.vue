<script setup>
import { computed, ref } from 'vue'
import { imagesApi } from '@/services/api.js'
import { useFileStore } from '@/plugins/file/store.js'
import { useViewerStore } from '@/plugins/viewer/store.js'
import { TYPE_ICON, TYPE_COLOR, formatBytes } from '@/utils/fileTypes.js'

const props = defineProps({
  file: { type: Object, required: true },
})
const emit        = defineEmits(['context-menu', 'select'])
const store       = useFileStore()
const viewerStore = useViewerStore()

const isSelected   = computed(() => store.selectedEntries.some(e => e.path === props.file.path))
const isImage      = computed(() => props.file.type === 'image')
const thumbnailUrl = computed(() =>
  isImage.value ? imagesApi.thumbnailUrl(props.file.path, 400) : null
)
const imgError = ref(false)

const typeIcon  = computed(() => TYPE_ICON[props.file.type]  || 'mdi-file-outline')
const typeColor = computed(() => TYPE_COLOR[props.file.type] || 'surface-variant')
const formatSize = (bytes) => formatBytes(bytes)

let clickTimer = null

function onClick(e) {
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => { emit('select', { file: props.file, event: e }) }, 250)
}

function onDblClick() {
  clearTimeout(clickTimer)
  if (props.file.is_dir) store.navigate(props.file.path)
  else viewerStore.open(props.file)
}

function onContextMenu(e) {
  e.preventDefault()
  e.stopPropagation()
  if (store.currentPath === '' && props.file.is_dir) return
  const hasMenu = store.writeMode || store.clipboard || !props.file.is_dir
  if (!hasMenu) return
  emit('context-menu', { file: props.file, x: e.clientX, y: e.clientY })
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
    @contextmenu="onContextMenu"
  >
    <img
      v-if="isImage && !imgError"
      :src="thumbnailUrl"
      :alt="file.name"
      class="thumb-img"
      :style="file.img_w && file.img_h ? { aspectRatio: `${file.img_w}/${file.img_h}` } : undefined"
      @error="imgError = true"
    />

    <div v-else class="icon-area d-flex flex-column align-center justify-center">
      <v-icon :color="typeColor" size="48">{{ typeIcon }}</v-icon>
      <v-chip class="mt-2" size="x-small" :color="typeColor" variant="tonal" label>
        {{ file.extension || file.type }}
      </v-chip>
    </div>

    <v-divider />

    <v-card-text class="py-2 px-3">
      <div class="d-flex align-center" style="min-width:0">
        <span class="text-body-2 font-weight-medium text-truncate" :title="file.name">{{ file.name }}</span>
        <v-icon v-if="file.is_symlink" size="13" color="medium-emphasis" class="ml-1 flex-shrink-0">mdi-link-variant</v-icon>
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
  transition: box-shadow 0.1s;
}
.file-card--selected {
  box-shadow: 0 0 0 2px rgb(var(--v-theme-primary)) !important;
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

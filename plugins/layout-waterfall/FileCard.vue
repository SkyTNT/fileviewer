<script setup>
import { computed, ref, inject } from 'vue'

const props = defineProps({
  file: { type: Object, required: true },
})
const emit           = defineEmits(['context-menu', 'select'])
const services    = inject('services')
const store       = services.get('explorer.state')
const appRegistry = services?.get('app.registry')
const ft          = services.get('file.types')

const isSelected   = computed(() => store.selectedEntries.some(e => e.path === props.file.path))
const thumbnailUrl = computed(() => ft.thumbnailUrl(props.file, 400))
const imgError = ref(false)

const typeIcon   = computed(() => ft.icon(props.file.type))
const typeColor  = computed(() => ft.color(props.file.type, 'surface-variant'))
const formatSize = (bytes) => ft.formatBytes(bytes)

let clickTimer = null

function onClick(e) {
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => { emit('select', { file: props.file, event: e }) }, 250)
}

function onDblClick() {
  clearTimeout(clickTimer)
  if (props.file.is_dir) store.navigate(props.file.path)
  else appRegistry?.open(props.file)
}

function onContextMenu(e) {
  e.preventDefault()
  e.stopPropagation()
  if (store.currentPath === '' && props.file.is_dir) return
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
      v-if="thumbnailUrl && !imgError"
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

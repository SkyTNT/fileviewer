<script setup>
import { computed } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'

const emit  = defineEmits(['open-file'])
const store = useFileStore()

const totalPages = computed(() => Math.ceil(store.total / store.pageSize))

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

const typeIcon  = t => TYPE_ICON[t]  || 'mdi-file-outline'
const typeColor = t => TYPE_COLOR[t] || undefined

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

let clickTimer = null

function onClick(file) {
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => store.selectEntry(file), 250)
}

function onDblClick(file) {
  clearTimeout(clickTimer)
  if (file.is_dir) store.navigate(file.path)
  else emit('open-file', file)
}
</script>

<template>
  <div class="list-scroll">
    <v-progress-linear v-if="store.loading" indeterminate color="primary" height="2" />

    <div v-if="!store.loading && store.total === 0" class="text-center text-grey pa-12">
      <v-icon size="64" class="mb-2">mdi-folder-open-outline</v-icon>
      <div>Empty directory</div>
    </div>

    <v-list v-else lines="one" class="pa-2" style="padding-bottom: 72px !important">
      <v-list-item
        v-for="file in store.entries"
        v-ripple
        :key="file.path"
        rounded="lg"
        density="comfortable"
        color="primary"
        :active="store.selectedEntry?.path === file.path"
        @click="onClick(file)"
        @dblclick="onDblClick(file)"
      >
        <template #prepend>
          <v-avatar size="36" :color="typeColor(file.type)" variant="tonal" rounded="lg">
            <v-icon size="20">{{ typeIcon(file.type) }}</v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="text-body-2 font-weight-medium">
          {{ file.name }}
        </v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          {{ formatDate(file.modified) }}
        </v-list-item-subtitle>

        <template #append>
          <span class="text-caption text-medium-emphasis">
            {{ formatSize(file.size) }}
          </span>
        </template>
      </v-list-item>
    </v-list>

    <div v-if="totalPages > 1" class="pagination-fab">
      <v-pagination
        :model-value="store.page"
        :length="totalPages"
        :total-visible="7"
        @update:model-value="store.goToPage"
      />
    </div>
  </div>
</template>

<style scoped>
.list-scroll {
  height: 100%;
  overflow-y: auto;
}
.pagination-fab {
  position: fixed;
  bottom: 16px;
  left: calc(var(--v-layout-left, 0px) + 16px);
  z-index: 10;
  background: rgb(var(--v-theme-surface));
  border-radius: 28px;
  box-shadow: 0 3px 10px rgba(0,0,0,.2);
  padding: 4px 8px;
}
</style>

<script setup>
import { computed, ref, watch } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import { imagesApi, filesApi, textApi } from '../../services/api.js'
import JsonNode from '../viewers/JsonNode.vue'

const store = useFileStore()
const file  = computed(() => store.selectedEntry)

const isImage = computed(() => file.value?.type === 'image')

// Same-name .json meta file
const metaData    = ref(null)
const metaLoading = ref(false)

watch(file, async (f) => {
  metaData.value = null
  if (!f || f.type !== 'image' || !f.extension) return
  const jsonPath = f.path.slice(0, -f.extension.length) + '.json'
  metaLoading.value = true
  try {
    const res = await textApi.getContent(jsonPath)
    metaData.value = JSON.parse(res.data.content)
  } catch {
    metaData.value = null
  } finally {
    metaLoading.value = false
  }
}, { immediate: true })

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

const typeIcon  = computed(() => TYPE_ICON[file.value?.type] || 'mdi-file-outline')
const typeColor = computed(() => TYPE_COLOR[file.value?.type] || 'surface-variant')

function formatSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}
</script>

<template>
  <div v-if="file" class="detail-panel">
    <!-- Header -->
    <div class="d-flex align-center px-3 pt-3 pb-1">
      <span class="text-subtitle-2 font-weight-bold">Details</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="store.selectEntry(null)">
        <v-icon size="18">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-divider />

    <!-- Preview -->
    <div class="preview-area pa-4 d-flex align-center justify-center">
      <img
        v-if="isImage"
        :src="imagesApi.thumbnailUrl(file.path, 400)"
        class="preview-img"
        :alt="file.name"
      />
      <v-icon v-else :color="typeColor" size="80">{{ typeIcon }}</v-icon>
    </div>

    <v-divider />

    <!-- Download button (files only) -->
    <div v-if="!file.is_dir" class="px-3 pt-3">
      <v-btn
        :href="filesApi.downloadUrl(file.path)"
        :download="file.name"
        color="primary"
        variant="tonal"
        block
        prepend-icon="mdi-download"
      >
        Download
      </v-btn>
    </div>

    <!-- Info rows -->
    <div class="info-list pa-3">
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Name</span>
        <span class="info-value text-body-2 text-wrap">{{ file.name }}</span>
      </div>

      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Type</span>
        <v-chip size="x-small" :color="typeColor" variant="tonal" label>
          {{ file.type }}
        </v-chip>
      </div>

      <div v-if="file.extension" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Extension</span>
        <span class="info-value text-body-2">{{ file.extension }}</span>
      </div>

      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Size</span>
        <span class="info-value text-body-2">{{ formatSize(file.size) }}</span>
      </div>

      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Modified</span>
        <span class="info-value text-body-2">{{ formatDate(file.modified) }}</span>
      </div>

      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">Path</span>
        <span class="info-value text-body-2 text-wrap path-text">{{ file.path || '/' }}</span>
      </div>
    </div>

    <!-- JSON meta from sibling .json file -->
    <template v-if="isImage">
      <v-divider class="mt-1" />
      <div class="px-3 pt-3 pb-1 d-flex align-center">
        <span class="text-caption text-medium-emphasis" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px">Meta</span>
        <v-progress-circular v-if="metaLoading" indeterminate size="12" width="2" class="ml-2" />
        <span v-else-if="!metaData" class="text-caption text-disabled ml-2">no .json found</span>
      </div>
      <div v-if="metaData" class="px-3 pb-3 meta-tree">
        <JsonNode :value="metaData" :depth="0" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-panel {
  height: 100%;
  overflow-y: auto;
}
.preview-area {
  min-height: 160px;
}
.preview-img {
  width: 100%;
  height: auto;
  border-radius: 8px;
  display: block;
}
.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.info-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.info-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.info-value {
  word-break: break-all;
}
.path-text {
  font-family: 'Roboto Mono', monospace;
  font-size: 12px;
}
.meta-tree {
  overflow-x: auto;
}
</style>

<script setup>
import { ref } from 'vue'
import { hexApi } from '../../services/api.js'

const dialog    = ref(false)
const loading   = ref(false)
const error     = ref(null)
const rows      = ref([])
const fileSize  = ref(0)
const page      = ref(1)
const totalPages = ref(1)
const currentFile = ref(null)

async function open(file) {
  currentFile.value = file
  dialog.value  = true
  page.value    = 1
  await fetchPage(1)
}

async function fetchPage(p) {
  loading.value = true
  error.value   = null
  try {
    const res    = await hexApi.getDump(currentFile.value.path, p)
    rows.value   = res.data.rows
    fileSize.value  = res.data.file_size
    totalPages.value = res.data.total_pages
    page.value   = res.data.page
  } catch (e) {
    error.value = e.response?.data?.detail || e.message
  } finally {
    loading.value = false
  }
}

function formatOffset(n) {
  return n.toString(16).padStart(8, '0').toUpperCase()
}

function formatHex(hexArr) {
  const lo = hexArr.slice(0, 8).map(h => h.toUpperCase()).join(' ')
  const hi = hexArr.slice(8).map(h => h.toUpperCase()).join(' ')
  // pad short last row
  const loPad = lo.padEnd(8 * 3 - 1, ' ')
  const hiPad = hi.padEnd(8 * 3 - 1, ' ')
  return `${loPad}  ${hiPad}`
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

defineExpose({ open })
</script>

<template>
  <v-dialog v-model="dialog" max-width="760" scrollable>
    <v-card style="display:flex; flex-direction:column; max-height:90vh">

      <!-- Title -->
      <v-card-title class="d-flex align-center pa-3 flex-shrink-0">
        <v-icon class="mr-2" size="20">mdi-hexadecimal</v-icon>
        <span class="text-truncate" style="max-width:60%">{{ currentFile?.name }}</span>
        <v-chip size="x-small" variant="tonal" color="secondary" class="ml-2">
          {{ formatSize(fileSize) }}
        </v-chip>
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="dialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <!-- Hex dump body -->
      <v-card-text class="pa-0 flex-grow-1" style="overflow:auto">
        <div v-if="loading" class="d-flex justify-center pa-8">
          <v-progress-circular indeterminate />
        </div>
        <v-alert v-else-if="error" type="error" class="ma-4">{{ error }}</v-alert>
        <div v-else class="hex-wrap pa-3">
          <!-- Header row -->
          <div class="hex-row hex-header">
            <span class="col-offset">Offset</span>
            <span class="col-bytes">00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
            <span class="col-ascii">ASCII</span>
          </div>
          <!-- Data rows -->
          <div
            v-for="row in rows"
            :key="row.offset"
            class="hex-row"
          >
            <span class="col-offset text-medium-emphasis">{{ formatOffset(row.offset) }}</span>
            <span class="col-bytes">{{ formatHex(row.hex) }}</span>
            <span class="col-ascii text-medium-emphasis">{{ row.ascii }}</span>
          </div>
        </div>
      </v-card-text>

      <!-- Pagination -->
      <template v-if="totalPages > 1">
        <v-divider />
        <div class="d-flex align-center justify-center pa-2 flex-shrink-0 ga-2">
          <v-btn
            icon="mdi-chevron-left"
            size="small"
            variant="text"
            :disabled="page <= 1 || loading"
            @click="fetchPage(page - 1)"
          />
          <span class="text-caption text-medium-emphasis">
            Page {{ page }} / {{ totalPages }}
            &nbsp;·&nbsp;
            rows {{ (page - 1) * 512 + 1 }}–{{ Math.min(page * 512, Math.ceil(fileSize / 16)) }}
          </span>
          <v-btn
            icon="mdi-chevron-right"
            size="small"
            variant="text"
            :disabled="page >= totalPages || loading"
            @click="fetchPage(page + 1)"
          />
        </div>
      </template>

    </v-card>
  </v-dialog>
</template>

<style scoped>
.hex-wrap {
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: nowrap;
}
.hex-row {
  display: flex;
  gap: 16px;
}
.hex-header {
  opacity: 0.45;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(128,128,128,0.2);
  padding-bottom: 4px;
}
.col-offset {
  flex: 0 0 8ch;
}
.col-bytes {
  flex: 0 0 48ch;
  letter-spacing: 0.02em;
}
.col-ascii {
  flex: 0 0 16ch;
  letter-spacing: 0.05em;
}
</style>

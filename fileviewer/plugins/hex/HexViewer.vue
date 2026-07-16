<script setup>
import { ref, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  file:       { type: Object, required: true },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})

const services      = inject('services')
const PaginationBar = services.get('ui.pagination-bar')
const hexApi        = services.get('hex.api')
const ft            = services.get('file.types')

const loading    = ref(false)
const error      = ref(null)
const rows       = ref([])
const fileSize   = ref(0)
const page       = ref(1)
const totalPages = ref(1)

const formatSize = (bytes) => ft.formatBytes(bytes)
const { t } = useI18n()

watch(() => props.file, (f) => { if (f) fetchPage(1) }, { immediate: true })

async function fetchPage(p) {
  loading.value = true
  error.value   = null
  try {
    const res      = await hexApi.getDump(props.file.path, p)
    rows.value       = res.data.rows
    fileSize.value   = res.data.file_size
    totalPages.value = res.data.total_pages
    page.value       = res.data.page
    props.winManager?.setTitle(props.winId, `${props.file.name} (${formatSize(res.data.file_size)})`)
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
  return `${lo.padEnd(8 * 3 - 1, ' ')}  ${hi.padEnd(8 * 3 - 1, ' ')}`
}
</script>

<template>
  <div class="hex-app">
    <div class="hex-scroll">
      <div v-if="loading && !rows.length" class="d-flex justify-center pa-8">
        <v-progress-circular indeterminate />
      </div>
      <v-alert v-else-if="error" type="error" class="ma-4">{{ error }}</v-alert>
      <div v-else class="hex-wrap pa-3">
        <div class="hex-row hex-header">
          <span class="col-offset">{{ t('hexApp.offset') }}</span>
          <span class="col-bytes">00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
          <span class="col-ascii">{{ t('hexApp.ascii') }}</span>
        </div>
        <div v-for="row in rows" :key="row.offset" class="hex-row">
          <span class="col-offset text-medium-emphasis">{{ formatOffset(row.offset) }}</span>
          <span class="col-bytes">{{ formatHex(row.hex) }}</span>
          <span class="col-ascii text-medium-emphasis">{{ row.ascii }}</span>
        </div>
      </div>
    </div>
    <div v-if="loading && rows.length" class="loading-overlay">
      <v-progress-circular indeterminate />
    </div>

    <template v-if="totalPages > 1">
      <v-divider />
      <div class="d-flex justify-center pa-2 flex-shrink-0">
        <PaginationBar
          :model-value="page"
          :total="totalPages"
          :disabled="loading"
          @navigate="fetchPage"
        >
          <span class="text-caption text-medium-emphasis">
            &nbsp;·&nbsp;
            {{ t('hexApp.rowRange', { from: (page - 1) * 512 + 1, to: Math.min(page * 512, Math.ceil(fileSize / 16)) }) }}
          </span>
        </PaginationBar>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hex-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}
.hex-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.hex-wrap {
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: nowrap;
}
.hex-row { display: flex; gap: 16px; }
.hex-header {
  opacity: 0.45;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(128,128,128,0.2);
  padding-bottom: 4px;
}
.col-offset { flex: 0 0 8ch; }
.col-bytes  { flex: 0 0 48ch; letter-spacing: 0.02em; }
.col-ascii  { flex: 0 0 16ch; letter-spacing: 0.05em; }
</style>

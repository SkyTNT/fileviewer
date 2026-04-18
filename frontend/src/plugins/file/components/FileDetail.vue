<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileStore } from '@/plugins/file/store.js'
import { imagesApi, textApi } from '@/services/api.js'
import { resolveDetailActions } from '@/plugins/actions/index.js'
import { TYPE_ICON, TYPE_COLOR, formatBytes, formatDate } from '@/utils/fileTypes.js'
import JsonNode from '@/plugins/viewer/viewers/JsonNode.vue'

const fileStore = useFileStore()
const { t }     = useI18n()

const singleActions = computed(() => resolveDetailActions('single'))
const multiActions  = computed(() => resolveDetailActions('multi'))

const file    = computed(() => fileStore.selectedEntry)
const isMulti = computed(() => fileStore.selectedEntries.length > 1)

const typeIcon  = computed(() => TYPE_ICON[file.value?.type] || 'mdi-file-outline')
const typeColor = computed(() => TYPE_COLOR[file.value?.type] || 'surface-variant')
const formatSize = (bytes) => formatBytes(bytes, '—')
const fmtDate    = (ts)    => formatDate(ts, '—')

const isImage  = computed(() => file.value?.type === 'image')
const imgError = ref(false)
watch(file, () => { imgError.value = false })

// Same-name .json meta file (images only)
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
</script>

<template>
  <!-- ── Multi-select panel ───────────────────────────────────────────────── -->
  <div v-if="isMulti" class="detail-panel">
    <div class="d-flex align-center px-3 pt-3 pb-1">
      <span class="text-subtitle-2 font-weight-bold">{{ t('detail.itemsSelected', { n: fileStore.selectedEntries.length }) }}</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="fileStore.clearSelection()">
        <v-icon size="18">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-divider />

    <div class="preview-area pa-4 d-flex align-center justify-center">
      <v-icon color="primary" size="80">mdi-checkbox-multiple-marked-outline</v-icon>
    </div>

    <v-divider />

    <div class="px-3 pt-3 d-flex flex-column ga-2">
      <template v-for="row in multiActions" :key="row.key">
        <div v-if="row.type === 'pair'" class="d-flex ga-2">
          <v-btn
            v-for="btn in row.items" :key="btn.key"
            :color="btn.color" variant="tonal" style="flex:1"
            :prepend-icon="btn.icon" @click="btn.action()"
          >{{ btn.label }}</v-btn>
        </div>
        <v-btn v-else :color="row.color" variant="tonal" block
               :prepend-icon="row.icon" @click="row.action()">{{ row.label }}</v-btn>
      </template>
    </div>

    <!-- Summary -->
    <div class="info-list pa-3">
      <div v-if="fileStore.selectedEntries.filter(e => !e.is_dir).length" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.files') }}</span>
        <span class="info-value text-body-2">{{ fileStore.selectedEntries.filter(e => !e.is_dir).length }}</span>
      </div>
      <div v-if="fileStore.selectedEntries.filter(e => e.is_dir).length" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.folders') }}</span>
        <span class="info-value text-body-2">{{ fileStore.selectedEntries.filter(e => e.is_dir).length }}</span>
      </div>
      <div v-if="fileStore.selectedEntries.filter(e => !e.is_dir).length" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.totalSize') }}</span>
        <span class="info-value text-body-2">{{ formatSize(fileStore.selectedEntries.reduce((s, e) => s + (e.size ?? 0), 0)) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.selected') }}</span>
        <div class="d-flex flex-column ga-1 mt-1">
          <span
            v-for="entry in fileStore.selectedEntries.slice(0, 10)" :key="entry.path"
            class="info-value text-body-2 text-truncate" :title="entry.name"
          >
            <v-icon size="14" class="mr-1" :color="entry.is_dir ? 'primary' : undefined">
              {{ entry.is_dir ? 'mdi-folder' : 'mdi-file-outline' }}
            </v-icon>{{ entry.name }}
          </span>
          <span v-if="fileStore.selectedEntries.length > 10" class="text-caption text-medium-emphasis">
            {{ t('detail.andMore', { n: fileStore.selectedEntries.length - 10 }) }}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Single-select panel ──────────────────────────────────────────────── -->
  <div v-else-if="file" class="detail-panel">
    <div class="d-flex align-center px-3 pt-3 pb-1">
      <span class="text-subtitle-2 font-weight-bold">{{ t('detail.details') }}</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="fileStore.selectEntry(null)">
        <v-icon size="18">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-divider />

    <!-- Preview -->
    <div class="preview-area pa-4 d-flex align-center justify-center">
      <img
        v-if="isImage && !imgError"
        :src="imagesApi.thumbnailUrl(file.path, 400)"
        class="preview-img" :alt="file.name"
        @error="imgError = true"
      />
      <v-icon v-else :color="typeColor" size="80">{{ typeIcon }}</v-icon>
    </div>

    <v-divider />

    <!-- Action buttons -->
    <div class="px-3 pt-3 d-flex flex-column ga-2">
      <template v-for="row in singleActions" :key="row.key">
        <div v-if="row.type === 'pair'" class="d-flex ga-2">
          <v-btn
            v-for="btn in row.items" :key="btn.key"
            :color="btn.color" variant="tonal" style="flex:1"
            :prepend-icon="btn.icon" @click="btn.action()"
          >{{ btn.label }}</v-btn>
        </div>
        <v-btn
          v-else-if="row.type === 'link'"
          :href="row.href" :download="row.downloadAttr"
          :color="row.color" variant="tonal" block :prepend-icon="row.icon"
        >{{ row.label }}</v-btn>
        <v-btn
          v-else
          :loading="row.loading" :color="row.color" variant="tonal" block
          :prepend-icon="row.icon" @click="row.action()"
        >{{ row.label }}</v-btn>
      </template>
    </div>

    <!-- Info rows -->
    <div class="info-list pa-3">
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.name') }}</span>
        <span class="info-value text-body-2 text-wrap">{{ file.name }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.type') }}</span>
        <div class="d-flex align-center ga-1">
          <v-chip size="x-small" :color="typeColor" variant="tonal" label>{{ file.type }}</v-chip>
          <v-chip v-if="file.is_symlink" size="x-small" color="medium-emphasis" variant="tonal" label>
            <v-icon start size="11">mdi-link-variant</v-icon>symlink
          </v-chip>
        </div>
      </div>
      <div v-if="file.extension" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.extension') }}</span>
        <span class="info-value text-body-2">{{ file.extension }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.size') }}</span>
        <span class="info-value text-body-2">{{ formatSize(file.size) }}</span>
      </div>
      <div v-if="file.img_w && file.img_h" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.dimensions') }}</span>
        <span class="info-value text-body-2">{{ file.img_w }} × {{ file.img_h }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.modified') }}</span>
        <span class="info-value text-body-2">{{ fmtDate(file.modified) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.path') }}</span>
        <span class="info-value text-body-2 text-wrap path-text">{{ file.path || '/' }}</span>
      </div>
    </div>

    <!-- JSON meta from sibling .json file -->
    <template v-if="isImage">
      <v-divider class="mt-1" />
      <div class="px-3 pt-3 pb-1 d-flex align-center">
        <span class="text-caption text-medium-emphasis" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px">{{ t('detail.meta') }}</span>
        <v-progress-circular v-if="metaLoading" indeterminate size="12" width="2" class="ml-2" />
        <span v-else-if="!metaData" class="text-caption text-disabled ml-2">{{ t('detail.noJsonFound') }}</span>
      </div>
      <div v-if="metaData" class="px-3 pb-3 meta-tree">
        <JsonNode :value="metaData" :depth="0" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-panel { height: 100%; overflow-y: auto; }
.preview-area { min-height: 160px; }
.preview-img  { width: 100%; height: auto; border-radius: 8px; display: block; }
.info-list    { display: flex; flex-direction: column; gap: 12px; }
.info-row     { display: flex; flex-direction: column; gap: 2px; }
.info-label   { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.info-value   { word-break: break-all; }
.path-text    { font-family: 'Roboto Mono', monospace; font-size: 12px; }
.meta-tree    { overflow-x: auto; }
</style>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { textApi } from '@/services/api.js'
import { useViewerStore } from '@/plugins/viewer/store.js'
import JsonNode from './JsonNode.vue'

const viewerStore = useViewerStore()
const { t } = useI18n()

const dialog   = ref(false)
const fileName = ref('')
const fileRef  = ref(null)
const isJsonl  = ref(false)

// tree state
const treeData       = ref(null)
const loading        = ref(false)
const error          = ref(null)
const picking        = ref(false)   // JSONL mode picker
const cachedContent  = ref(null)    // content cached when JSON→JSONL fallback

async function open(file) {
  fileRef.value       = file
  fileName.value      = file.name
  isJsonl.value       = file.extension === '.jsonl' || file.extension === '.ndjson'
  treeData.value      = null
  error.value         = null
  cachedContent.value = null

  if (isJsonl.value) {
    // JSONL: let user choose tree or dataframe
    picking.value = true
    dialog.value  = true
  } else {
    // JSON: directly load tree
    picking.value = false
    dialog.value  = true
    await loadTree()
  }
}

function _looksLikeJsonl(content) {
  const lines = content.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return false
  const valid = lines.filter(l => { try { JSON.parse(l); return true } catch { return false } }).length
  return valid / lines.length >= 0.5
}

async function loadTree() {
  loading.value = true
  error.value   = null
  try {
    let content
    if (cachedContent.value !== null) {
      content = cachedContent.value
    } else {
      const res = await textApi.getContent(fileRef.value.path)
      content = res.data.content
    }

    if (isJsonl.value) {
      treeData.value = content
        .trim().split('\n').filter(l => l.trim())
        .flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } })
    } else {
      try {
        treeData.value = JSON.parse(content)
      } catch {
        // JSON parse failed — check if it's actually JSONL mis-named as .json
        if (_looksLikeJsonl(content)) {
          isJsonl.value       = true
          cachedContent.value = content
          picking.value       = true
          return
        }
        throw new Error('Invalid JSON')
      }
    }
  } catch (e) {
    error.value = e.response?.data?.detail || e.message
  } finally {
    loading.value = false
  }
}

function chooseTree() {
  picking.value = false
  loadTree()
}

function chooseDataframe() {
  dialog.value = false
  viewerStore.open(fileRef.value, { viewer: 'dataframe', mode: 'jsonl' })
}

function close() { dialog.value = false }

defineExpose({ open })
</script>

<template>
  <v-dialog v-model="dialog" max-width="1000" scrollable>
    <v-card style="min-height:400px">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-code-json</v-icon>
        {{ fileName }}
        <v-spacer />
        <v-btn icon size="small" @click="close"><v-icon>mdi-close</v-icon></v-btn>
      </v-card-title>
      <v-divider />

      <v-card-text style="max-height:80vh; overflow:auto">
        <!-- JSONL mode picker -->
        <div v-if="picking" class="d-flex flex-column align-center justify-center pa-12 ga-4">
          <p class="text-h6 mb-2">{{ t('jsonViewer.openAs') }}</p>
          <div class="d-flex ga-4">
            <v-btn prepend-icon="mdi-file-tree-outline" color="primary" variant="tonal" size="large" @click="chooseTree">
              {{ t('jsonViewer.jsonTree') }}
            </v-btn>
            <v-btn prepend-icon="mdi-table-large" color="secondary" variant="tonal" size="large" @click="chooseDataframe">
              {{ t('jsonViewer.dataframe') }}
            </v-btn>
          </div>
        </div>

        <!-- Loading -->
        <div v-else-if="loading" class="d-flex justify-center pa-12">
          <v-progress-circular indeterminate />
        </div>

        <!-- Error -->
        <v-alert v-else-if="error" type="error" class="ma-4">{{ error }}</v-alert>

        <!-- Tree -->
        <div v-else-if="treeData !== null" class="tree-scroll pa-3">
          <JsonNode :value="treeData" :depth="0" />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.tree-scroll {
  background: rgb(var(--v-theme-surface));
  border-radius: 4px;
  font-family: 'Roboto Mono', monospace;
}
</style>

<script setup>
import { ref } from 'vue'
import { textApi } from '../../services/api.js'
import JsonNode from './JsonNode.vue'

const emit = defineEmits(['open-dataframe'])

const dialog   = ref(false)
const fileName = ref('')
const fileRef  = ref(null)
const isJsonl  = ref(false)

// tree state
const treeData  = ref(null)
const loading   = ref(false)
const error     = ref(null)
const picking   = ref(false)   // JSONL mode picker

async function open(file) {
  fileRef.value  = file
  fileName.value = file.name
  isJsonl.value  = file.extension === '.jsonl'
  treeData.value = null
  error.value    = null

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

async function loadTree() {
  loading.value = true
  error.value   = null
  try {
    const res = await textApi.getContent(fileRef.value.path)
    if (isJsonl.value) {
      treeData.value = res.data.content
        .trim().split('\n').filter(l => l.trim())
        .flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } })
    } else {
      treeData.value = JSON.parse(res.data.content)
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
  emit('open-dataframe', fileRef.value)
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
          <p class="text-h6 mb-2">Open as…</p>
          <div class="d-flex ga-4">
            <v-btn prepend-icon="mdi-file-tree-outline" color="primary" variant="tonal" size="large" @click="chooseTree">
              JSON Tree
            </v-btn>
            <v-btn prepend-icon="mdi-table-large" color="secondary" variant="tonal" size="large" @click="chooseDataframe">
              DataFrame
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

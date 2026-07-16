<script setup>
import { ref, watch, inject } from 'vue'
import JsonNode from './JsonNode.vue'

const props = defineProps({
  file:  { type: Object, default: null },
  value: { type: null,   default: undefined },
})

const textApi = inject('services')?.get('text.api')

const treeData = ref(null)
const loading  = ref(false)
const error    = ref(null)

watch(() => [props.file, props.value], () => {
  treeData.value = null
  error.value    = null
  if (props.value !== undefined) {
    treeData.value = props.value
  } else if (props.file) {
    loadTree()
  }
}, { immediate: true })

function _looksLikeJsonl(content) {
  const lines = content.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return false
  const valid = lines.filter(l => { try { JSON.parse(l); return true } catch { return false } }).length
  return valid / lines.length >= 0.5
}

async function loadTree() {
  const isJsonl = props.file.extension === '.jsonl' || props.file.extension === '.ndjson'
  loading.value = true
  error.value   = null
  try {
    const res     = await textApi.getContent(props.file.path)
    const content = res.data.content

    if (isJsonl) {
      treeData.value = content
        .trim().split('\n').filter(l => l.trim())
        .flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } })
    } else {
      try {
        treeData.value = JSON.parse(content)
      } catch {
        if (_looksLikeJsonl(content)) {
          treeData.value = content
            .trim().split('\n').filter(l => l.trim())
            .flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } })
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
</script>

<template>
  <div class="json-app">
    <div class="json-scroll">
      <div v-if="loading" class="d-flex justify-center pa-12">
        <v-progress-circular indeterminate />
      </div>

      <v-alert v-else-if="error" type="error" class="ma-4">{{ error }}</v-alert>

      <div v-else-if="treeData !== null" class="tree-scroll pa-3">
        <JsonNode :value="treeData" :depth="0" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.json-app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.json-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.tree-scroll {
  background: rgb(var(--v-theme-surface));
  border-radius: 4px;
  font-family: 'Roboto Mono', monospace;
}
</style>

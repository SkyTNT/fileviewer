<script setup>
import { ref, onMounted, watch } from 'vue'
import { filesApi } from '../../services/api.js'
import { useFileStore } from '../../stores/fileStore.js'
import { useAuthStore } from '../../stores/authStore.js'
import TreeNode from './TreeNode.vue'

const store     = useFileStore()
const authStore = useAuthStore()
const rootNodes = ref([])
const loading   = ref(false)

async function loadRoot() {
  loading.value = true
  try {
    const res = await filesApi.getTree('', 1)
    rootNodes.value = (res.data.children || []).filter(c => c.is_dir)
  } catch { rootNodes.value = [] }
  finally  { loading.value = false }
}

onMounted(() => { if (authStore.loggedIn) loadRoot() })
watch(() => authStore.loggedIn, (v) => { if (v) loadRoot() })
</script>

<template>
  <v-list density="compact" nav class="pa-2">
    <!-- Root home item -->
    <v-list-item
      :active="store.currentPath === ''"
      color="primary"
      rounded="lg"
      prepend-icon="mdi-home-outline"
      :title="store.rootName"
      @click="store.navigate('')"
    />

    <v-divider class="my-1" />

    <div v-if="loading" class="d-flex justify-center pa-3">
      <v-progress-circular indeterminate size="20" width="2" />
    </div>

    <TreeNode
      v-for="node in rootNodes"
      :key="node.path"
      :node="node"
      :depth="0"
      :reveal-path="store.currentPath"
    />
  </v-list>
</template>

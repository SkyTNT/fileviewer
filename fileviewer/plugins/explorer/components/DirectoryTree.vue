<script setup>
import { computed, inject } from 'vue'
import TreeNode from './TreeNode.vue'

const store = inject('services').get('explorer.state')

// Roots are already loaded in the store — no extra API call needed.
const rootNodes = computed(() =>
  store.roots.map(r => ({ name: r.name, path: r.slug, is_dir: true }))
)
</script>

<template>
  <div style="height:100%; overflow:auto">
    <v-list density="compact" nav class="pa-2" style="width:max-content; min-width:100%">
      <v-list-item
        :active="store.isAtHome"
        color="primary"
        rounded="lg"
        prepend-icon="mdi-home-outline"
        :title="store.rootName"
        @click="store.navigate('')"
      />

      <v-divider class="my-1" />

      <TreeNode
        v-for="node in rootNodes"
        :key="node.path"
        :node="node"
        :depth="0"
        :reveal-path="store.currentPath"
      />
    </v-list>
  </div>
</template>

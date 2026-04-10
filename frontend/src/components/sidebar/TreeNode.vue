<script setup>
import { ref, watch, nextTick } from 'vue'
import { filesApi } from '../../services/api.js'
import { useFileStore } from '../../stores/fileStore.js'

const props = defineProps({
  node:       { type: Object, required: true },
  depth:      { type: Number, default: 0 },
  revealPath: { type: String, default: '' },
})

const store    = ref(useFileStore())
const expanded = ref(false)
const children = ref([])
const loading  = ref(false)
const itemRef  = ref(null)

async function loadChildren() {
  if (children.value.length > 0 || loading.value) return
  loading.value = true
  try {
    const res  = await filesApi.getTree(props.node.path, 1)
    children.value = (res.data.children || []).filter(c => c.is_dir)
  } catch { children.value = [] }
  finally  { loading.value = false }
}

async function toggle(e) {
  e.stopPropagation()
  expanded.value = !expanded.value
  if (expanded.value) await loadChildren()
}

function navigate() {
  store.value.navigate(props.node.path)
}

// Scroll into view when this node becomes the active one
watch(
  () => store.value.currentPath === props.node.path,
  async (isActive) => {
    if (isActive) {
      await nextTick()
      itemRef.value?.$el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  },
  { immediate: true }
)

// Expand automatically when revealPath passes through this node
watch(() => props.revealPath, async (target) => {
  if (!target) return
  const isAncestorOrSelf =
    target === props.node.path || target.startsWith(props.node.path + '/')
  if (!isAncestorOrSelf) return
  expanded.value = true
  await loadChildren()
}, { immediate: true })
</script>

<template>
  <div>
    <v-list-item
      ref="itemRef"
      :active="store.currentPath === node.path"
      color="primary"
      density="compact"
      rounded="lg"
      :style="{ paddingLeft: (depth * 16 + 4) + 'px' }"
      @click="navigate"
    >
      <template #prepend>
        <!-- expand/collapse arrow -->
        <v-icon
          size="16"
          class="expand-icon mr-1"
          @click="toggle"
        >
          {{
            loading    ? 'mdi-loading mdi-spin' :
            expanded   ? 'mdi-chevron-down'     :
                         'mdi-chevron-right'
          }}
        </v-icon>
        <!-- folder icon -->
        <v-icon size="20" color="primary" class="mr-2">
          {{ expanded ? 'mdi-folder-open' : 'mdi-folder' }}
        </v-icon>
      </template>

      <v-list-item-title class="text-body-2">{{ node.name }}</v-list-item-title>
    </v-list-item>

    <template v-if="expanded && children.length">
      <TreeNode
        v-for="child in children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :reveal-path="revealPath"
      />
    </template>
  </div>
</template>

<style scoped>
.expand-icon { opacity: 0.6; }
.expand-icon:hover { opacity: 1; }
</style>

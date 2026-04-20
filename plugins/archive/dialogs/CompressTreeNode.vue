<script setup>
import { ref, computed, inject } from 'vue'
const props = defineProps({
  item:  { type: Object,  required: true },
  depth: { type: Number,  default: 0 },
})
const emit = defineEmits(['toggle'])

const filesApi = inject('services').get('files.api')
const ft       = inject('services').get('file.types')

const expanded = ref(false)
const loadError = ref(null)
const loading   = ref(false)

const checkIcon = computed(() => {
  if (props.item.check === 'checked')       return 'mdi-checkbox-marked'
  if (props.item.check === 'indeterminate') return 'mdi-minus-box'
  return 'mdi-checkbox-blank-outline'
})
const checkColor = computed(() =>
  props.item.check === 'unchecked' ? 'medium-emphasis' : 'primary'
)

async function toggleExpand() {
  if (!props.item.is_dir) return
  expanded.value = !expanded.value
  if (expanded.value && !props.item.loaded) {
    loading.value = true
    loadError.value = null
    try {
      const res = await filesApi.listDirectory(props.item.path, 1, 200)
      const children = res.data.entries.map(e => ({
        ...e,
        check: props.item.check === 'unchecked' ? 'unchecked' : 'checked',
        children: e.is_dir ? null : undefined,
        loaded: false,
      }))
      props.item.children = children
      props.item.loaded = true
    } catch (e) {
      loadError.value = e.message
    } finally {
      loading.value = false
    }
  }
}

function handleToggle(item) {
  emit('toggle', item)
}
</script>

<template>
  <div>
    <v-list-item
      density="compact"
      class="compress-tree-item"
      :style="{ paddingLeft: (depth * 16 + 4) + 'px' }"
    >
      <!-- checkbox -->
      <template #prepend>
        <v-icon
          size="18"
          :color="checkColor"
          class="mr-1 flex-shrink-0"
          style="cursor:pointer"
          @click.stop="$emit('toggle', item)"
        >
          {{ checkIcon }}
        </v-icon>
        <!-- directory expand toggle -->
        <v-icon
          v-if="item.is_dir"
          size="16"
          color="primary"
          class="mr-1"
          style="cursor:pointer"
          @click.stop="toggleExpand"
        >
          {{ loading ? 'mdi-loading' : (expanded ? 'mdi-folder-open' : 'mdi-folder') }}
        </v-icon>
        <v-icon v-else size="16" class="mr-1">mdi-file-outline</v-icon>
      </template>

      <v-list-item-title
        class="text-body-2"
        :class="{ 'text-disabled': item.check === 'unchecked' }"
        style="cursor:pointer"
        @click.stop="item.is_dir ? toggleExpand() : $emit('toggle', item)"
      >
        {{ item.name }}
      </v-list-item-title>

      <template #append>
        <span v-if="!item.is_dir" class="text-caption text-medium-emphasis">
          {{ ft.formatBytes(item.size) }}
        </span>
        <v-icon v-if="item.is_dir" size="14" @click.stop="toggleExpand">
          {{ expanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
        </v-icon>
      </template>
    </v-list-item>

    <!-- children -->
    <div v-if="item.is_dir && expanded">
      <div v-if="loadError" class="text-caption text-error pl-8">{{ loadError }}</div>
      <CompressTreeNode
        v-for="child in (item.children || [])"
        :key="child.path"
        :item="child"
        :depth="depth + 1"
        @toggle="handleToggle"
      />
    </div>
  </div>
</template>

<style scoped>
.compress-tree-item {
  min-height: 32px !important;
}
</style>

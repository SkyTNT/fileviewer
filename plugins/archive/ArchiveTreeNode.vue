<script setup>
import { ref, computed, inject } from 'vue'

const ft = inject('services').get('file.types')

const props = defineProps({
  item:         { type: Object,  required: true },
  randomAccess: { type: Boolean, default: false },
  selectedPath: { type: String,  default: null },
  depth:        { type: Number,  default: 0 },
  checkedPaths: { type: Object,  default: () => new Set() },  // Set<string>
})
const emit = defineEmits(['select', 'toggle'])

const expanded = ref(props.depth < 2)
function toggle() { expanded.value = !expanded.value }

const isChecked      = computed(() => props.checkedPaths.has(props.item.path))
const isIndeterminate = computed(() => {
  if (!props.item.is_dir || isChecked.value) return false
  return hasAnyChecked(props.item)
})

function hasAnyChecked(node) {
  if (props.checkedPaths.has(node.path)) return true
  if (!node.is_dir || !node.children) return false
  return node.children.some(c => hasAnyChecked(c))
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (['jpg','jpeg','png','gif','webp','bmp','svg','tiff','tif'].includes(ext)) return 'mdi-image-outline'
  if (['mp4','webm','avi','mov','mkv'].includes(ext))  return 'mdi-play-circle-outline'
  if (['mp3','wav','flac','ogg','m4a'].includes(ext))  return 'mdi-music-note'
  if (['json','jsonl'].includes(ext))                  return 'mdi-code-json'
  if (['pdf'].includes(ext))                           return 'mdi-file-pdf-box'
  if (['zip','tar','gz','bz2','xz','7z'].includes(ext))return 'mdi-archive-outline'
  return 'mdi-file-outline'
}
</script>

<template>
  <!-- Directory node -->
  <div v-if="item.is_dir">
    <v-list-item
      :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
      density="compact"
      class="archive-tree-item"
      @click.stop="toggle"
    >
      <template #prepend>
        <v-checkbox-btn
          :model-value="isChecked"
          :indeterminate="isIndeterminate"
          density="compact"
          class="flex-shrink-0 cb"
          @click.stop="$emit('toggle', item)"
        />
        <v-icon size="16" color="primary" class="mr-1">
          {{ expanded ? 'mdi-folder-open' : 'mdi-folder' }}
        </v-icon>
      </template>
      <v-list-item-title class="text-body-2">{{ item.name || item.path }}</v-list-item-title>
      <template #append>
        <v-icon size="14" class="text-medium-emphasis">
          {{ expanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
        </v-icon>
      </template>
    </v-list-item>

    <div v-if="expanded && item.children">
      <ArchiveTreeNode
        v-for="child in item.children"
        :key="child.path"
        :item="child"
        :random-access="randomAccess"
        :selected-path="selectedPath"
        :depth="depth + 1"
        :checked-paths="checkedPaths"
        @select="$emit('select', $event)"
        @toggle="$emit('toggle', $event)"
      />
    </div>
  </div>

  <!-- File node -->
  <v-list-item
    v-else
    :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
    density="compact"
    :class="['archive-tree-item', { 'archive-tree-item--selected': item.path === selectedPath }]"
    @click.stop="randomAccess && $emit('select', item)"
  >
    <template #prepend>
      <v-checkbox-btn
        :model-value="checkedPaths.has(item.path)"
        density="compact"
        class="flex-shrink-0 cb"
        @click.stop="$emit('toggle', item)"
      />
      <v-icon size="16" class="mr-1">{{ fileIcon(item.name) }}</v-icon>
    </template>
    <v-list-item-title class="text-body-2">{{ item.name }}</v-list-item-title>
    <template #append>
      <span class="text-caption text-medium-emphasis">{{ ft.formatBytes(item.size) }}</span>
    </template>
  </v-list-item>
</template>

<style scoped>
.archive-tree-item {
  cursor: pointer;
  border-radius: 4px;
  min-height: 32px !important;
}
.archive-tree-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.archive-tree-item--selected {
  background: rgba(var(--v-theme-primary), 0.12) !important;
}
/* Tighten checkbox width */
.cb { margin-left: -6px; margin-right: 2px; }
</style>

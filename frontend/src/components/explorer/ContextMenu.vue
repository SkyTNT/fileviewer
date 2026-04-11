<script setup>
import { useFileStore } from '../../stores/fileStore.js'
import { filesApi } from '../../services/api.js'

const props = defineProps({
  modelValue: Boolean,
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  file: { type: Object, default: null },  // null = background (no file selected)
})

const emit  = defineEmits(['update:modelValue', 'rename', 'delete', 'mkdir', 'touch', 'paste'])
const store = useFileStore()

const canWrite = () => store.writeMode && !(store.multiRoot && store.currentPath === '')
</script>

<template>
  <v-menu
    :model-value="modelValue"
    :style="{ position: 'fixed', left: x + 'px', top: y + 'px' }"
    close-on-content-click
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-list density="compact" min-width="180">

      <!-- Download (files only) -->
      <v-list-item
        v-if="file && !file.is_dir"
        prepend-icon="mdi-download-outline"
        title="Download"
        :href="filesApi.downloadUrl(file.path)"
        :download="file.name"
      />

      <template v-if="canWrite()">

        <!-- File-specific write operations -->
        <template v-if="file">
          <v-divider v-if="!file.is_dir" />
          <v-list-item prepend-icon="mdi-content-copy" title="Copy"   @click="store.setCopy(file)" />
          <v-list-item prepend-icon="mdi-content-cut"  title="Cut"    @click="store.setCut(file)" />
          <v-divider />
          <v-list-item prepend-icon="mdi-pencil-outline" title="Rename" @click="$emit('rename')" />
          <v-list-item prepend-icon="mdi-delete-outline" title="Delete" base-color="error" @click="$emit('delete')" />
          <v-divider />
        </template>

        <!-- Background operations (always visible in write mode) -->
        <v-list-item prepend-icon="mdi-folder-plus-outline" title="New Folder" @click="$emit('mkdir')" />
        <v-list-item prepend-icon="mdi-file-plus-outline"   title="New File"   @click="$emit('touch')" />

        <template v-if="store.clipboard">
          <v-divider />
          <v-list-item prepend-icon="mdi-content-paste" title="Paste here" @click="$emit('paste')" />
        </template>

      </template>

    </v-list>
  </v-menu>
</template>

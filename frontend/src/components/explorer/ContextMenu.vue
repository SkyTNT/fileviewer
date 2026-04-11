<script setup>
import { computed, ref } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import { filesApi } from '../../services/api.js'
import { copyFileToClipboard } from '../../composables/useCopyToClipboard.js'

const props = defineProps({
  modelValue: Boolean,
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  file: { type: Object, default: null },  // null = background (no file selected)
})

const emit  = defineEmits(['update:modelValue', 'rename', 'delete', 'delete-multi', 'mkdir', 'touch', 'paste', 'error'])
const store = useFileStore()

const canWrite = () => store.writeMode && !store.isAtHome

// Is the right-clicked file part of a multi-selection?
const isMultiTarget = computed(() =>
  props.file != null &&
  store.selectedEntries.length > 1 &&
  store.selectedEntries.some(e => e.path === props.file.path)
)

const multiDownloadFiles = computed(() =>
  store.selectedEntries.filter(e => !e.is_dir)
)

const copiedSnack = ref(false)

async function copyClipboard() {
  try {
    await copyFileToClipboard(props.file)
    copiedSnack.value = true
  } catch (e) {
    emit('error', e.message)
  }
}

function downloadMulti() {
  multiDownloadFiles.value.forEach(f => {
    const a = document.createElement('a')
    a.href = filesApi.downloadUrl(f.path)
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  })
}
</script>

<template>
  <v-menu
    :model-value="modelValue"
    :style="{ position: 'fixed', left: x + 'px', top: y + 'px' }"
    close-on-content-click
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-list density="compact" min-width="180">

      <!-- Batch download (multi-select) -->
      <v-list-item
        v-if="isMultiTarget && multiDownloadFiles.length"
        prepend-icon="mdi-download-outline"
        :title="`Download ${multiDownloadFiles.length} files`"
        @click="downloadMulti"
      />

      <!-- Single file download -->
      <v-list-item
        v-else-if="file && !file.is_dir"
        prepend-icon="mdi-download-outline"
        title="Download"
        :href="filesApi.downloadUrl(file.path)"
        :download="file.name"
      />

      <!-- Copy to clipboard (single file) -->
      <v-list-item
        v-if="file && !file.is_dir && !isMultiTarget"
        prepend-icon="mdi-clipboard-outline"
        title="Copy to clipboard"
        @click="copyClipboard"
      />

      <template v-if="canWrite()">

        <!-- File-specific write operations -->
        <template v-if="file">
          <v-divider v-if="!file.is_dir || isMultiTarget" />
          <v-list-item prepend-icon="mdi-content-copy" :title="isMultiTarget ? `Copy ${store.selectedEntries.length} items` : 'Copy'" @click="store.setCopy(file)" />
          <v-list-item prepend-icon="mdi-content-cut"  :title="isMultiTarget ? `Cut ${store.selectedEntries.length} items` : 'Cut'"  @click="store.setCut(file)" />
          <template v-if="isMultiTarget">
            <v-divider />
            <v-list-item prepend-icon="mdi-delete-outline" :title="`Delete ${store.selectedEntries.length} items`" base-color="error" @click="$emit('delete-multi', store.selectedEntries)" />
          </template>
          <template v-else>
            <v-divider />
            <v-list-item prepend-icon="mdi-pencil-outline" title="Rename" @click="$emit('rename')" />
            <v-list-item prepend-icon="mdi-delete-outline" title="Delete" base-color="error" @click="$emit('delete')" />
          </template>
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

  <v-snackbar v-model="copiedSnack" timeout="2000" color="success" location="bottom">
    <v-icon class="mr-2">mdi-check</v-icon>
    Copied to clipboard
  </v-snackbar>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileStore } from '../../stores/fileStore.js'
import { filesApi } from '../../services/api.js'
import { copyFileToClipboard } from '../../composables/useCopyToClipboard.js'
import { useNotification } from '../../composables/useNotification.js'

const props = defineProps({
  modelValue: Boolean,
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  file: { type: Object, default: null },  // null = background (no file selected)
})

const emit  = defineEmits(['update:modelValue', 'rename', 'delete', 'delete-multi', 'mkdir', 'touch', 'paste'])
const store = useFileStore()
const { showError, showSuccess } = useNotification()
const { t } = useI18n()

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

async function copyClipboard() {
  try {
    await copyFileToClipboard(props.file)
    showSuccess(t('notify.copiedToClipboard'))
  } catch (e) {
    showError(e.message)
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
        :title="t('menu.downloadFiles', { n: multiDownloadFiles.length })"
        @click="downloadMulti"
      />

      <!-- Single file download -->
      <v-list-item
        v-else-if="file && !file.is_dir"
        prepend-icon="mdi-download-outline"
        :title="t('menu.download')"
        :href="filesApi.downloadUrl(file.path)"
        :download="file.name"
      />

      <!-- Copy to clipboard (single file) -->
      <v-list-item
        v-if="file && !file.is_dir && !isMultiTarget"
        prepend-icon="mdi-clipboard-outline"
        :title="t('menu.copyToClipboard')"
        @click="copyClipboard"
      />

      <template v-if="canWrite()">

        <!-- File-specific write operations -->
        <template v-if="file">
          <v-divider v-if="!file.is_dir || isMultiTarget" />
          <v-list-item
            prepend-icon="mdi-content-copy"
            :title="isMultiTarget ? t('menu.copyItems', { n: store.selectedEntries.length }) : t('menu.copy')"
            @click="store.setCopy(file)"
          />
          <v-list-item
            prepend-icon="mdi-content-cut"
            :title="isMultiTarget ? t('menu.cutItems', { n: store.selectedEntries.length }) : t('menu.cut')"
            @click="store.setCut(file)"
          />
          <template v-if="isMultiTarget">
            <v-divider />
            <v-list-item
              prepend-icon="mdi-delete-outline"
              :title="t('menu.deleteItems', { n: store.selectedEntries.length })"
              base-color="error"
              @click="$emit('delete-multi', store.selectedEntries)"
            />
          </template>
          <template v-else>
            <v-divider />
            <v-list-item prepend-icon="mdi-pencil-outline" :title="t('menu.rename')" @click="$emit('rename')" />
            <v-list-item prepend-icon="mdi-delete-outline" :title="t('menu.delete')" base-color="error" @click="$emit('delete')" />
          </template>
          <v-divider />
        </template>

        <!-- Background operations (always visible in write mode) -->
        <v-list-item prepend-icon="mdi-folder-plus-outline" :title="t('menu.newFolder')" @click="$emit('mkdir')" />
        <v-list-item prepend-icon="mdi-file-plus-outline"   :title="t('menu.newFile')"   @click="$emit('touch')" />

        <template v-if="store.clipboard">
          <v-divider />
          <v-list-item prepend-icon="mdi-content-paste" :title="t('menu.paste')" @click="$emit('paste')" />
        </template>

      </template>

    </v-list>
  </v-menu>

</template>

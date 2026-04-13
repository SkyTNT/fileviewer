<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileStore } from '../../stores/fileStore.js'
import { copyFileToClipboard } from '../../composables/useCopyToClipboard.js'
import { useNotificationStore } from '../../stores/notificationStore.js'
import { downloadFiles } from '../../utils/download.js'

const props = defineProps({
  modelValue: Boolean,
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  file: { type: Object, default: null },  // null = background (no file selected)
})

const emit  = defineEmits(['update:modelValue', 'rename', 'delete', 'mkdir', 'touch', 'paste'])
const store = useFileStore()
const { showError, showSuccess } = useNotificationStore()
const { t } = useI18n()

const anchorEl = ref(null)

const canWrite = () => store.writeMode && !store.isAtHome

// Is the right-clicked file part of a multi-selection?
const isMultiTarget = computed(() =>
  props.file != null &&
  store.selectedEntries.length > 1 &&
  store.selectedEntries.some(e => e.path === props.file.path)
)

// Files to download (excludes dirs)
const downloadTargets = computed(() =>
  isMultiTarget.value
    ? store.selectedEntries.filter(e => !e.is_dir)
    : (props.file && !props.file.is_dir ? [props.file] : [])
)

// Entries to delete
const deleteTargets = computed(() =>
  isMultiTarget.value ? store.selectedEntries : (props.file ? [props.file] : [])
)

async function copyClipboard() {
  try {
    await copyFileToClipboard(props.file)
    showSuccess(t('notify.copiedToClipboard'))
  } catch (e) {
    showError(e.message)
  }
}
</script>

<template>
  <!-- Zero-size anchor at the click position; Vuetify uses it for overflow-aware placement -->
  <div
    ref="anchorEl"
    :style="{ position: 'fixed', left: x + 'px', top: y + 'px', width: 0, height: 0, pointerEvents: 'none' }"
  />
  <v-menu
    :model-value="modelValue"
    :activator="anchorEl"
    location="bottom start"
    close-on-content-click
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-list density="compact" min-width="180">

      <!-- Download -->
      <v-list-item
        v-if="downloadTargets.length"
        prepend-icon="mdi-download-outline"
        :title="downloadTargets.length > 1 ? t('menu.downloadFiles', { n: downloadTargets.length }) : t('menu.download')"
        @click="downloadFiles(downloadTargets)"
      />

      <!-- Copy to clipboard (single file only) -->
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
            @click="store.setCopy(isMultiTarget ? store.selectedEntries : [file])"
          />
          <v-list-item
            prepend-icon="mdi-content-cut"
            :title="isMultiTarget ? t('menu.cutItems', { n: store.selectedEntries.length }) : t('menu.cut')"
            @click="store.setCut(isMultiTarget ? store.selectedEntries : [file])"
          />
          <v-divider />
          <v-list-item
            v-if="!isMultiTarget"
            prepend-icon="mdi-pencil-outline"
            :title="t('menu.rename')"
            @click="$emit('rename')"
          />
          <v-list-item
            prepend-icon="mdi-delete-outline"
            :title="isMultiTarget ? t('menu.deleteItems', { n: store.selectedEntries.length }) : t('menu.delete')"
            base-color="error"
            @click="$emit('delete', deleteTargets)"
          />
          <v-divider />
        </template>

        <!-- Background operations -->
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

<script setup>
import { useI18n } from 'vue-i18n'
import { useWriteActions } from '../../composables/useWriteActions.js'
import { useArchiveActions } from '../../composables/useArchiveActions.js'
import DialogNewItem from './DialogNewItem.vue'
import DialogConfirmDelete from './DialogConfirmDelete.vue'
import DialogCompress from './DialogCompress.vue'
import DialogExtractProgress from './DialogExtractProgress.vue'
import DialogNameConflict from './DialogNameConflict.vue'

const { t } = useI18n()

const {
  renameDialog, renameName, renameLoading, renameError, confirmRename,
  deleteDialog, deleteTargets, confirmDelete,
  mkdirDialog,  mkdirName,  mkdirLoading,  mkdirError,  confirmMkdir,
  touchDialog,  touchName,  touchLoading,  touchError,  confirmTouch,
} = useWriteActions()

const { compressDialog, compressSources } = useArchiveActions()
</script>

<template>
  <DialogNewItem
    v-model="renameDialog"
    :title="t('dialog.renameTitle')"
    :label="t('dialog.newName')"
    :confirm-text="t('dialog.rename')"
    v-model:name="renameName"
    :loading="renameLoading"
    :error="renameError"
    @confirm="confirmRename"
  />
  <DialogConfirmDelete v-model="deleteDialog" :targets="deleteTargets" @confirm="confirmDelete" />
  <DialogNewItem
    v-model="mkdirDialog"
    :title="t('dialog.newFolder')"
    :label="t('dialog.folderName')"
    v-model:name="mkdirName"
    :loading="mkdirLoading"
    :error="mkdirError"
    @confirm="confirmMkdir"
  />
  <DialogNewItem
    v-model="touchDialog"
    :title="t('dialog.newFile')"
    :label="t('dialog.fileName')"
    v-model:name="touchName"
    :loading="touchLoading"
    :error="touchError"
    @confirm="confirmTouch"
  />
  <DialogCompress v-model="compressDialog" :sources="compressSources" />
  <DialogExtractProgress />
  <DialogNameConflict />
</template>

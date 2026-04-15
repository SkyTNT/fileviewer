<script setup>
import { useI18n } from 'vue-i18n'
import { useWriteStore } from './store.js'
import DialogNewItem      from './dialogs/DialogNewItem.vue'
import DialogConfirmDelete from './dialogs/DialogConfirmDelete.vue'
import DialogNameConflict  from './dialogs/DialogNameConflict.vue'

const { t }        = useI18n()
const writeStore   = useWriteStore()
</script>

<template>
  <DialogNewItem
    v-model="writeStore.rename.dialog"
    :title="t('dialog.renameTitle')"
    :label="t('dialog.newName')"
    :confirm-text="t('dialog.rename')"
    v-model:name="writeStore.rename.name"
    :loading="writeStore.rename.loading"
    :error="writeStore.rename.error"
    @confirm="writeStore.confirmRename"
  />
  <DialogConfirmDelete
    v-model="writeStore.del.dialog"
    :targets="writeStore.del.targets"
    @confirm="writeStore.confirmDelete"
  />
  <DialogNewItem
    v-model="writeStore.mkdir.dialog"
    :title="t('dialog.newFolder')"
    :label="t('dialog.folderName')"
    v-model:name="writeStore.mkdir.name"
    :loading="writeStore.mkdir.loading"
    :error="writeStore.mkdir.error"
    @confirm="writeStore.confirmMkdir"
  />
  <DialogNewItem
    v-model="writeStore.touch.dialog"
    :title="t('dialog.newFile')"
    :label="t('dialog.fileName')"
    v-model:name="writeStore.touch.name"
    :loading="writeStore.touch.loading"
    :error="writeStore.touch.error"
    @confirm="writeStore.confirmTouch"
  />
  <DialogNameConflict />
</template>

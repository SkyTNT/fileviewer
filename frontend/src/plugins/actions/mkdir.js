import { useWriteStore } from '@/plugins/write/store.js'
import { t, file, canWrite } from './ctx.js'

export default {
  key: 'mkdir',

  // Background-only operation: only shown in ContextMenu, not in FileDetail.
  menu: {
    icon: 'mdi-folder-plus-outline',
    label: () => t('menu.newFolder'),
    show: () => canWrite(),
    // Divider separates file-specific operations above from background operations.
    dividerBefore: () => !!file(),
  },

  action: () => useWriteStore().openMkdir(),
}

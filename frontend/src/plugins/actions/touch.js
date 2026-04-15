import { useWriteStore } from '@/plugins/write/store.js'
import { t, canWrite } from './ctx.js'

export default {
  key: 'touch',

  // Background-only operation: only shown in ContextMenu, not in FileDetail.
  menu: {
    icon: 'mdi-file-plus-outline',
    label: () => t('menu.newFile'),
    show: () => canWrite(),
  },

  action: () => useWriteStore().openTouch(),
}

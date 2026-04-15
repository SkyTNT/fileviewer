import { useFileStore } from '@/plugins/file/store.js'
import { useWriteStore } from '@/plugins/write/store.js'
import { t, canWrite } from './ctx.js'

export default {
  key: 'paste',

  // Background-only operation: only shown in ContextMenu, not in FileDetail.
  menu: {
    icon: 'mdi-content-paste',
    label: () => t('menu.paste'),
    show: () => canWrite() && !!useFileStore().clipboard,
    dividerBefore: () => true,
  },

  action: () => useWriteStore().doPaste(),
}

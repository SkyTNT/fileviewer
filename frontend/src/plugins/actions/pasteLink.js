import { useFileStore } from '@/plugins/file/store.js'
import { useWriteStore } from '@/plugins/write/store.js'
import { t, canWrite } from './ctx.js'

export default {
  key: 'paste-link',

  menu: {
    icon: 'mdi-link-variant',
    label: () => t('menu.pasteLink'),
    show: () => canWrite() && !!useFileStore().clipboard,
  },

  action: () => useWriteStore().doPasteLink(),
}

import { useFileStore } from '@/plugins/file/store.js'
import { useWriteStore } from '@/plugins/write/store.js'
import { t, file, canWrite, isTarget } from './ctx.js'

export default {
  key: 'rename',

  menu: {
    icon: 'mdi-pencil-outline',
    label: () => t('menu.rename'),
    show: () => canWrite() && !!file() && !isTarget(),
    // Always show divider before rename; when rename is hidden (multi-target),
    // the delete action takes over the divider responsibility.
    dividerBefore: () => canWrite() && !!file(),
  },

  detail: {
    icon: 'mdi-pencil-outline',
    label: () => t('detail.rename'),
    color: 'secondary',
    showSingle: () => canWrite(),
  },

  action: () => useWriteStore().openRename(file(), () => useFileStore().selectEntry(null)),
}

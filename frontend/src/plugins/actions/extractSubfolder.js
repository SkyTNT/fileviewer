import { useArchiveStore } from '@/plugins/archive/store.js'
import { t, file, canWrite, isTarget } from './ctx.js'

export default {
  key: 'extract-subfolder',

  menu: {
    icon: 'mdi-folder-arrow-down-outline',
    label: () => t('menu.extractToSubfolder'),
    show: () => !!file() && !isTarget() && file().type === 'archive',
  },

  detail: {
    icon: 'mdi-folder-arrow-down-outline',
    label: () => t('detail.extractToSubfolder'),
    color: 'orange',
    showSingle: () => file().type === 'archive' && canWrite(),
  },

  action: () => useArchiveStore().extractToSubfolder(file()),
}

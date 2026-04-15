import { useArchiveStore } from '@/plugins/archive/store.js'
import { t, file, canWrite, isTarget } from './ctx.js'

export default {
  key: 'extract-here',

  menu: {
    icon: 'mdi-archive-arrow-down-outline',
    label: () => t('menu.extractHere'),
    show: () => !!file() && !isTarget() && file().type === 'archive',
    dividerBefore: () => true,
  },

  detail: {
    icon: 'mdi-archive-arrow-down-outline',
    label: () => t('detail.extractHere'),
    color: 'orange',
    showSingle: () => file().type === 'archive' && canWrite(),
  },

  action: () => useArchiveStore().extractHere(file()),
}

import { useArchiveStore } from '@/plugins/archive/store.js'
import { t, file, selection, isTarget, canWrite } from './ctx.js'

const targets = () =>
  isTarget() ? selection() : file() ? [file()] : selection()

export default {
  key: 'compress',

  menu: {
    icon: 'mdi-archive-plus-outline',
    label: () => t('menu.addToArchive'),
    show: () => targets().length > 0,
    dividerBefore: () => true,
  },

  detail: {
    icon: 'mdi-archive-plus-outline',
    label: () => t('detail.addToArchive'),
    color: 'orange',
    showSingle: () => canWrite(),
    showMulti: () => canWrite(),
  },

  action: () => useArchiveStore().openCompress(targets()),
}

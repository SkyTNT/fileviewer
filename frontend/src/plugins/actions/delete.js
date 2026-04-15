import { useWriteStore } from '@/plugins/write/store.js'
import { t, file, selection, isTarget, isMulti, canWrite } from './ctx.js'

const targets = () => isTarget() ? selection() : file() ? [file()] : selection()

export default {
  key: 'delete',

  menu: {
    icon: 'mdi-delete-outline',
    label: () => isTarget()
      ? t('menu.deleteItems', { n: selection().length })
      : t('menu.delete'),
    show: () => canWrite() && !!file(),
    color: 'error',
    // In multi-target mode rename is hidden, so delete owns the divider.
    dividerBefore: () => canWrite() && !!file() && isTarget(),
  },

  detail: {
    icon: 'mdi-delete-outline',
    label: () => isMulti()
      ? t('detail.deleteItems', { n: selection().length })
      : t('detail.delete'),
    color: 'error',
    showSingle: () => canWrite(),
    showMulti: () => canWrite(),
  },

  action: () => useWriteStore().openDelete(targets()),
}

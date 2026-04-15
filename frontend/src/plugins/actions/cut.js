import { useFileStore } from '@/plugins/file/store.js'
import { t, file, selection, isTarget, canWrite } from './ctx.js'

const targets = () => isTarget() ? selection() : [file()]

export default {
  key: 'cut',

  menu: {
    icon: 'mdi-content-cut',
    label: () => isTarget()
      ? t('menu.cutItems', { n: selection().length })
      : t('menu.cut'),
    show: () => canWrite() && !!file(),
  },

  detail: {
    icon: 'mdi-content-cut',
    label: () => t('detail.cut'),
    color: 'secondary',
    showSingle: () => canWrite(),
    showMulti: () => canWrite(),
    group: 'copy-cut',
  },

  action: () => useFileStore().setCut(targets()),
}

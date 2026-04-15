import { useFileStore } from '@/plugins/file/store.js'
import { t, file, selection, isTarget, canWrite } from './ctx.js'

const targets = () => isTarget() ? selection() : [file()]

export default {
  key: 'copy',

  menu: {
    icon: 'mdi-content-copy',
    label: () => isTarget()
      ? t('menu.copyItems', { n: selection().length })
      : t('menu.copy'),
    show: () => canWrite() && !!file(),
    dividerBefore: () => !!file() && (!file().is_dir || isTarget()),
  },

  detail: {
    icon: 'mdi-content-copy',
    label: () => t('detail.copy'),
    color: 'secondary',
    showSingle: () => canWrite(),
    showMulti: () => canWrite(),
    group: 'copy-cut',
  },

  action: () => useFileStore().setCopy(targets()),
}

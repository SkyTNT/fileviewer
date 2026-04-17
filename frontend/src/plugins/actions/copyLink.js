import { useFileStore } from '@/plugins/file/store.js'
import { t, file, selection, isTarget, canWrite } from './ctx.js'

const targets = () => { const f = file(); return (isTarget() || !f) ? selection() : [f] }

export default {
  key: 'copy-link',

  menu: {
    icon: 'mdi-link-variant',
    label: () => isTarget()
      ? t('menu.copyLinkItems', { n: selection().length })
      : t('menu.copyLink'),
    show: () => canWrite() && !!file(),
  },

  detail: {
    icon: 'mdi-link-variant',
    label: () => t('detail.copyLink'),
    color: 'secondary',
    showSingle: () => canWrite(),
    showMulti: () => canWrite(),
  },

  action: () => useFileStore().setCopyLink(targets()),
}

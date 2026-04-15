import { useViewerStore } from '@/plugins/viewer/store.js'
import { t, selection, isTarget } from './ctx.js'

export default {
  key: 'compare',

  menu: {
    icon: 'mdi-image-multiple-outline',
    label: () => t('menu.compareImages'),
    show: () =>
      isTarget() &&
      selection().length === 2 &&
      selection().every(e => e.type === 'image'),
  },

  detail: {
    icon: 'mdi-image-multiple-outline',
    label: () => t('detail.compareImages'),
    color: 'primary',
    showMulti: () =>
      selection().length === 2 &&
      selection().every(e => e.type === 'image'),
  },

  action: () => useViewerStore().open(selection()),
}

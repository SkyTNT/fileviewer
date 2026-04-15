import { open } from '../composables/useViewerRegistry.js'

export default {
  key: 'compare',

  menu: {
    icon: 'mdi-image-multiple-outline',
    label: (ctx) => ctx.t('menu.compareImages'),
    show: (ctx) =>
      ctx.isTarget &&
      ctx.selection.length === 2 &&
      ctx.selection.every(e => e.type === 'image'),
  },

  detail: {
    icon: 'mdi-image-multiple-outline',
    label: (ctx) => ctx.t('detail.compareImages'),
    color: 'primary',
    showMulti: (ctx) =>
      ctx.selection.length === 2 &&
      ctx.selection.every(e => e.type === 'image'),
  },

  action: (ctx) => open(ctx.selection),
}

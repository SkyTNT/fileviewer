export default {
  key: 'extract-here',

  menu: {
    icon: 'mdi-archive-arrow-down-outline',
    label: (ctx) => ctx.t('menu.extractHere'),
    show: (ctx) => !!ctx.file && !ctx.isTarget && ctx.file.type === 'archive',
    dividerBefore: () => true,
  },

  detail: {
    icon: 'mdi-archive-arrow-down-outline',
    label: (ctx) => ctx.t('detail.extractHere'),
    color: 'orange',
    showSingle: (ctx) => ctx.file.type === 'archive' && ctx.canWrite,
  },

  action: (ctx) => ctx.extractHere(ctx.file),
}

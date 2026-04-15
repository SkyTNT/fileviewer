const targets = (ctx) =>
  ctx.isTarget ? ctx.selection : ctx.file ? [ctx.file] : ctx.selection

export default {
  key: 'compress',

  menu: {
    icon: 'mdi-archive-plus-outline',
    label: (ctx) => ctx.t('menu.addToArchive'),
    show: (ctx) => targets(ctx).length > 0,
    dividerBefore: () => true,
  },

  detail: {
    icon: 'mdi-archive-plus-outline',
    label: (ctx) => ctx.t('detail.addToArchive'),
    color: 'orange',
    showSingle: (ctx) => ctx.canWrite,
    showMulti: (ctx) => ctx.canWrite,
  },

  action: (ctx) => ctx.openCompress(targets(ctx)),
}

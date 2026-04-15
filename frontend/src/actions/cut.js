const targets = (ctx) => ctx.isTarget ? ctx.selection : [ctx.file]

export default {
  key: 'cut',

  menu: {
    icon: 'mdi-content-cut',
    label: (ctx) => ctx.isTarget
      ? ctx.t('menu.cutItems', { n: ctx.selection.length })
      : ctx.t('menu.cut'),
    show: (ctx) => ctx.canWrite && !!ctx.file,
  },

  detail: {
    icon: 'mdi-content-cut',
    label: (ctx) => ctx.t('detail.cut'),
    color: 'secondary',
    showSingle: (ctx) => ctx.canWrite,
    showMulti: (ctx) => ctx.canWrite,
    group: 'copy-cut',
  },

  action: (ctx) => ctx.store.setCut(targets(ctx)),
}

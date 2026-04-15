const targets = (ctx) => ctx.isTarget ? ctx.selection : ctx.file ? [ctx.file] : ctx.selection

export default {
  key: 'delete',

  menu: {
    icon: 'mdi-delete-outline',
    label: (ctx) => ctx.isTarget
      ? ctx.t('menu.deleteItems', { n: ctx.selection.length })
      : ctx.t('menu.delete'),
    show: (ctx) => ctx.canWrite && !!ctx.file,
    color: 'error',
    // In multi-target mode rename is hidden, so delete owns the divider.
    dividerBefore: (ctx) => ctx.canWrite && !!ctx.file && ctx.isTarget,
  },

  detail: {
    icon: 'mdi-delete-outline',
    label: (ctx) => ctx.isMulti
      ? ctx.t('detail.deleteItems', { n: ctx.selection.length })
      : ctx.t('detail.delete'),
    color: 'error',
    showSingle: (ctx) => ctx.canWrite,
    showMulti: (ctx) => ctx.canWrite,
  },

  action: (ctx) => ctx.openDelete(targets(ctx)),
}

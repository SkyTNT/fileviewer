const targets = (ctx) => ctx.isTarget ? ctx.selection : [ctx.file]

export default {
  key: 'copy',

  menu: {
    icon: 'mdi-content-copy',
    label: (ctx) => ctx.isTarget
      ? ctx.t('menu.copyItems', { n: ctx.selection.length })
      : ctx.t('menu.copy'),
    show: (ctx) => ctx.canWrite && !!ctx.file,
    // Show divider when non-dir file or multi-target has items above (download / clipboard)
    dividerBefore: (ctx) => !!ctx.file && (!ctx.file.is_dir || ctx.isTarget),
  },

  detail: {
    icon: 'mdi-content-copy',
    label: (ctx) => ctx.t('detail.copy'),
    color: 'secondary',
    showSingle: (ctx) => ctx.canWrite,
    showMulti: (ctx) => ctx.canWrite,
    group: 'copy-cut',
  },

  action: (ctx) => ctx.store.setCopy(targets(ctx)),
}

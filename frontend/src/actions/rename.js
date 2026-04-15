export default {
  key: 'rename',

  menu: {
    icon: 'mdi-pencil-outline',
    label: (ctx) => ctx.t('menu.rename'),
    show: (ctx) => ctx.canWrite && !!ctx.file && !ctx.isTarget,
    // Always show divider before rename; when rename is hidden (multi-target),
    // the delete action takes over the divider responsibility.
    dividerBefore: (ctx) => ctx.canWrite && !!ctx.file,
  },

  detail: {
    icon: 'mdi-pencil-outline',
    label: (ctx) => ctx.t('detail.rename'),
    color: 'secondary',
    showSingle: (ctx) => ctx.canWrite,
  },

  action: (ctx) => ctx.openRename(ctx.file, () => ctx.store.selectEntry(null)),
}

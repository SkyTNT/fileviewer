export default {
  key: 'paste',

  // Background-only operation: only shown in ContextMenu, not in FileDetail.
  menu: {
    icon: 'mdi-content-paste',
    label: (ctx) => ctx.t('menu.paste'),
    show: (ctx) => ctx.canWrite && !!ctx.store.clipboard,
    dividerBefore: () => true,
  },

  action: (ctx) => ctx.doPaste(),
}

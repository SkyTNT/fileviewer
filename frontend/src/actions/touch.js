export default {
  key: 'touch',

  // Background-only operation: only shown in ContextMenu, not in FileDetail.
  menu: {
    icon: 'mdi-file-plus-outline',
    label: (ctx) => ctx.t('menu.newFile'),
    show: (ctx) => ctx.canWrite,
  },

  action: (ctx) => ctx.openTouch(),
}

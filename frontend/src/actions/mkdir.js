export default {
  key: 'mkdir',

  // Background-only operation: only shown in ContextMenu, not in FileDetail.
  menu: {
    icon: 'mdi-folder-plus-outline',
    label: (ctx) => ctx.t('menu.newFolder'),
    show: (ctx) => ctx.canWrite,
    // Divider separates file-specific operations above from background operations.
    dividerBefore: (ctx) => !!ctx.file,
  },

  action: (ctx) => ctx.openMkdir(),
}

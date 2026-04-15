export default {
  key: 'extract-subfolder',

  menu: {
    icon: 'mdi-folder-arrow-down-outline',
    label: (ctx) => ctx.t('menu.extractToSubfolder'),
    show: (ctx) => !!ctx.file && !ctx.isTarget && ctx.file.type === 'archive',
  },

  detail: {
    icon: 'mdi-folder-arrow-down-outline',
    label: (ctx) => ctx.t('detail.extractToSubfolder'),
    color: 'orange',
    showSingle: (ctx) => ctx.file.type === 'archive' && ctx.canWrite,
  },

  action: (ctx) => ctx.extractToSubfolder(ctx.file),
}

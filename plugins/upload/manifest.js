export const manifest = {
  id: 'upload',
  name: 'Upload',
  version: '1.0.0',
  provides: { services: ['upload.store'] },
  requires: { services: ['write.api', 'task.store', 'fs-ops.conflict-dialog', 'window.manager', 'app.config', 'explorer.state', 'toolbar.registry', 'slot.host', 'i18n'], plugins: ['explorer', 'task-panel'] },
}

export const manifest = {
  id: 'upload',
  name: 'Upload',
  version: '1.0.0',
  provides: { services: ['upload.state'] },
  requires: { services: ['write.api', 'task.state', 'fs-ops.conflict-dialog', 'window.manager', 'app.config', 'explorer.state', 'toolbar.registry', 'slot.host', 'i18n'], plugins: ['explorer', 'task-panel'] },
}

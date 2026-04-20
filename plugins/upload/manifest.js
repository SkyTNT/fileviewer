export const manifest = {
  id: 'upload',
  name: 'Upload',
  version: '1.0.0',
  provides: { services: ['upload.store'] },
  requires: { services: ['write.api', 'task.store', 'fs-ops.conflict-dialog'], plugins: ['explorer', 'task-panel'] },
}

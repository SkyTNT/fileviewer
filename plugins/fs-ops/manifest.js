export const manifest = {
  id: 'fs-ops',
  name: 'File System Operations',
  version: '1.0.0',
  provides: { services: ['write.state', 'write.api', 'fs-ops.conflict-dialog'] },
  requires: { services: ['network.http', 'network.httpStream', 'network.sse', 'files.api', 'text.api', 'slot.host', 'file.types', 'explorer.state', 'task.state', 'window.manager', 'app.config'], plugins: ['explorer', 'task-panel', 'text'] },
}

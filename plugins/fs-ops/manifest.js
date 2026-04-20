export const manifest = {
  id: 'fs-ops',
  name: 'File System Operations',
  version: '1.0.0',
  provides: { services: ['write.store', 'write.api', 'fs-ops.conflict-dialog'] },
  requires: { services: ['network.http', 'network.httpStream', 'network.sse', 'files.api', 'slot.host', 'file.types', 'explorer.state', 'task.store'], plugins: ['explorer', 'task-panel'] },
}

export const manifest = {
  id: 'archive',
  name: 'Archive App',
  version: '1.0.0',
  provides: { services: ['archive.store', 'archive.api'] },
  requires: { services: ['network.http', 'network.httpStream', 'network.sse', 'files.api', 'app.registry', 'slot.host', 'explorer.state', 'write.api', 'write.store', 'file.types', 'task.store', 'ui.json-node', 'fs-ops.conflict-dialog'], plugins: ['task-panel'] },
}

export const manifest = {
  id: 'task-panel',
  name: 'Task Panel',
  version: '1.0.0',
  provides: { services: ['task.state'] },
  requires: { services: ['window.manager'], plugins: [] },
}

export const manifest = {
  id: 'explorer',
  name: 'Explorer',
  version: '1.0.0',
  provides: { services: ['explorer.state', 'explorer.views'] },
  requires: { services: ['files.api', 'app.config', 'app.registry', 'layout.registry', 'action.registry', 'file.types'], plugins: ['auth', 'task-panel'] },
}

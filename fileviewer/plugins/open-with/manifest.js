export const manifest = {
  id: 'open-with',
  name: 'Open With',
  version: '1.0.0',
  provides: { services: [] },
  requires: { services: ['app.registry', 'action.registry', 'window.manager', 'explorer.state'], plugins: ['explorer'] },
}

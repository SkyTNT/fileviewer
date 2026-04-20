export const manifest = {
  id: 'text',
  name: 'Text App',
  version: '1.0.0',
  provides: { services: ['text.api', 'ui.json-node'] },
  requires: { services: ['network.http', 'app.registry', 'window.manager'], plugins: [] },
}

export const manifest = {
  id: 'text',
  name: 'Text App',
  version: '1.0.0',
  provides: { services: ['text.api', 'text.json-node', 'text.json-viewer'] },
  requires: { services: ['network.http', 'app.registry', 'window.manager'], plugins: [] },
}

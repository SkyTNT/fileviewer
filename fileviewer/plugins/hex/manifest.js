export const manifest = {
  id: 'hex',
  name: 'Hex App',
  version: '1.0.0',
  provides: { services: ['hex.api'] },
  requires: { services: ['network.http', 'app.registry', 'explorer.state', 'file.types', 'ui.pagination-bar', 'window.manager'], plugins: [] },
}

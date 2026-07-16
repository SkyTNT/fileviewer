export const manifest = {
  id: 'dataframe',
  name: 'DataFrame App',
  version: '1.0.0',
  provides: { services: ['dataframe.api'] },
  requires: { services: ['network.http', 'images.api', 'app.registry', 'ui.pagination-bar', 'text.json-viewer', 'window.manager'], plugins: [] },
}

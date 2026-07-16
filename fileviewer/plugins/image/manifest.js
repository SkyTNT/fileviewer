export const manifest = {
  id: 'image',
  name: 'Image App',
  version: '1.0.0',
  provides: { services: ['images.api'] },
  requires: { services: ['network.http', 'app.registry', 'explorer.state', 'window.manager'], plugins: [] },
}

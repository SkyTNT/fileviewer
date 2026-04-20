export const manifest = {
  id: 'media',
  name: 'Media App',
  version: '1.0.0',
  provides: { services: ['media.api'] },
  requires: { services: ['app.registry'], plugins: [] },
}

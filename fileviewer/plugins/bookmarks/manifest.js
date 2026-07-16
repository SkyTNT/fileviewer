export const manifest = {
  id: 'bookmarks',
  name: 'Bookmarks',
  version: '1.0.0',
  provides: { services: ['bookmarks.state'] },
  requires: { services: ['explorer.sidebar', 'explorer.state', 'toolbar.registry'], plugins: [] },
}

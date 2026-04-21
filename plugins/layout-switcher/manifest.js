export const manifest = {
  id: 'layout-switcher',
  name: 'Layout Switcher',
  version: '1.0.0',
  provides: { services: [] },
  requires: { services: ['layout.registry', 'toolbar.registry', 'window.manager'], plugins: ['explorer'] },
}

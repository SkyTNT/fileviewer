export const manifest = {
  id: 'layout-list',
  name: 'List Layout',
  version: '1.0.0',
  provides: { services: [] },
  requires: { services: ['layout.registry', 'explorer.useRubberBand', 'explorer.useContextMenu', 'explorer.useExplorerKeyboard', 'explorer.ContextMenu'], plugins: ['explorer'] },
}

export const manifest = {
  id: 'explorer',
  name: 'Explorer',
  version: '1.0.0',
  provides: { services: ['explorer.sidebar', 'explorer.state', 'explorer.useRubberBand', 'explorer.useContextMenu', 'explorer.useExplorerKeyboard', 'explorer.ContextMenu'] },
  requires: { services: ['files.api', 'app.config', 'app.registry', 'layout.registry', 'action.registry', 'file.types'], plugins: ['task-panel'] },
}

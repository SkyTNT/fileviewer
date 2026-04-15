// Module-level scope registry — no Pinia needed, no UI state to expose.
const scopes = []

/**
 * Register a set of keyboard shortcuts.
 *
 * @param {Record<string, (e: KeyboardEvent) => boolean|void>} keys
 *   Map of e.key → handler. Return `false` to pass through to lower-priority scopes.
 * @param {{ priority?: number, inDialog?: boolean }} [options]
 *   priority  — higher numbers fire first (default 0).
 *   inDialog  — also fires when focus is inside a [role="dialog"] (default false).
 * @returns {() => void} unregister function
 */
export function registerKeyboard(keys, options = {}) {
  const scope = {
    id:       Symbol(),
    keys,
    priority: options.priority ?? 0,
    inDialog: options.inDialog ?? false,
  }
  scopes.push(scope)
  scopes.sort((a, b) => b.priority - a.priority)
  return () => {
    const i = scopes.findIndex(s => s.id === scope.id)
    if (i !== -1) scopes.splice(i, 1)
  }
}

function dispatch(e) {
  const el = document.activeElement
  if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
  const inDialog = !!el?.closest('[role="dialog"]')

  for (const scope of scopes) {
    if (inDialog && !scope.inDialog) continue
    const handler = scope.keys[e.key]
    if (handler) {
      const result = handler(e)
      if (result !== false) return  // stop propagation through scopes
    }
  }
}

export default {
  install() {
    window.addEventListener('keydown', dispatch)
  },
}

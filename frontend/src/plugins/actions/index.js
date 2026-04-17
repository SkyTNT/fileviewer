import open           from './open.js'
import compare        from './compare.js'
import download       from './download.js'
import copyClipboard  from './copyClipboard.js'
import extractHere    from './extractHere.js'
import extractSubfolder from './extractSubfolder.js'
import compress       from './compress.js'
import copy           from './copy.js'
import cut            from './cut.js'
import rename         from './rename.js'
import deleteAction   from './delete.js'
import mkdir          from './mkdir.js'
import touch          from './touch.js'
import paste          from './paste.js'
import pasteLink      from './pasteLink.js'

// ── Action registry ────────────────────────────────────────────────────────────
//
// To add a new action:
//   1. Create frontend/src/plugins/actions/myAction.js
//   2. Import and add it to ACTIONS below (order = render order)
//
// Action descriptor shape:
//   key     — unique string
//   menu?   — ContextMenu config: { icon, label(), show(), color?, dividerBefore?() }
//   detail? — FileDetail config:  { icon, label(), color?, group?,
//                                   showSingle?(), showMulti?(),
//                                   loading?(), href?(), downloadAttr?() }
//   action() — invoked when the user triggers this action
//
// Actions are fully self-contained: they import their own stores and helpers
// from ./ctx.js. No context object is passed — stores are global singletons.

export const ACTIONS = [
  open,
  compare,
  download,
  copyClipboard,
  extractHere,
  extractSubfolder,
  compress,
  copy,
  cut,
  rename,
  deleteAction,
  mkdir,
  touch,
  paste,
  pasteLink,
]

// ── ContextMenu items ──────────────────────────────────────────────────────────
export function resolveMenuActions() {
  const result = []
  for (const action of ACTIONS) {
    if (!action.menu?.show()) continue
    result.push({
      key: action.key,
      icon: action.menu.icon,
      label: action.menu.label(),
      color: action.menu.color,
      divider: (action.menu.dividerBefore?.() ?? false) && result.length > 0,
      action: () => action.action(),
    })
  }
  return result
}

// ── FileDetail action buttons ──────────────────────────────────────────────────
// mode: 'single' | 'multi'
// Adjacent visible actions sharing the same detail.group render as a flex pair.
export function resolveDetailActions(mode) {
  const showKey = mode === 'single' ? 'showSingle' : 'showMulti'
  const visible = ACTIONS.filter(a => a.detail?.[showKey]?.())

  const rows = []
  let i = 0
  while (i < visible.length) {
    const a = visible[i]
    const group = a.detail.group
    if (group && visible[i + 1]?.detail?.group === group) {
      rows.push({
        type: 'pair',
        key: group + '-pair',
        items: [_resolveDetailItem(visible[i]), _resolveDetailItem(visible[i + 1])],
      })
      i += 2
    } else {
      rows.push(_resolveDetailItem(a))
      i++
    }
  }
  return rows
}

function _resolveDetailItem(action) {
  const d = action.detail
  const href = d.href?.() ?? null
  return {
    key: action.key,
    type: href ? 'link' : 'button',
    icon: typeof d.icon === 'function' ? d.icon() : d.icon,
    label: d.label(),
    color: d.color ?? 'secondary',
    loading: d.loading?.() ?? false,
    href,
    downloadAttr: d.downloadAttr?.() ?? null,
    action: () => action.action(),
  }
}

export default {
  install() {},
}

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

// ── Action registry ────────────────────────────────────────────────────────────
//
// To add a new action:
//   1. Create frontend/src/actions/myAction.js
//   2. Import and add it to ACTIONS below (order = render order)
//
// Action descriptor shape:
//   key     — unique string
//   menu?   — ContextMenu config: { icon, label(ctx), show(ctx), color?, dividerBefore?(ctx) }
//   detail? — FileDetail config:  { icon, label(ctx), color?, group?,
//                                   showSingle?(ctx), showMulti?(ctx),
//                                   loading?(ctx), href?(ctx), downloadAttr?(ctx) }
//   action(ctx) — invoked when the user triggers this action
//
// ActionContext fields (assembled by useActionContext + surface-specific overrides):
//   file        — primary target: right-clicked (menu) | selected file (detail-single) | null (detail-multi)
//   selection   — store.selectedEntries (or [file] for single mode)
//   isTarget    — file is part of the multi-selection (ContextMenu only; always false in FileDetail)
//   isMulti     — selection.length > 1
//   canWrite    — boolean: write mode and not at home
//   store       — FileStore instance
//   t           — i18n translate function
//   openRename(file, callback?)  — open rename dialog
//   openDelete(targets)          — open delete confirmation dialog
//   openCompress(targets)        — open compress dialog
//   extractHere(file)            — extract archive to current folder
//   extractToSubfolder(file)     — extract archive to sub-folder
//   openMkdir()                  — open new-folder dialog
//   openTouch()                  — open new-file dialog
//   doPaste()                    — paste clipboard
//   copyToClipboard(?)           — copy file content to system clipboard
//   copyLoading                  — boolean: clipboard copy in progress

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
]

// ── ContextMenu items ──────────────────────────────────────────────────────────
export function resolveMenuActions(ctx) {
  const result = []
  for (const action of ACTIONS) {
    if (!action.menu?.show(ctx)) continue
    result.push({
      key: action.key,
      icon: action.menu.icon,
      label: action.menu.label(ctx),
      color: action.menu.color,
      divider: (action.menu.dividerBefore?.(ctx) ?? false) && result.length > 0,
      action: () => action.action(ctx),
    })
  }
  return result
}

// ── FileDetail action buttons ──────────────────────────────────────────────────
// mode: 'single' | 'multi'
// Adjacent visible actions sharing the same detail.group render as a flex pair.
export function resolveDetailActions(ctx, mode) {
  const showKey = mode === 'single' ? 'showSingle' : 'showMulti'
  const visible = ACTIONS.filter(a => a.detail?.[showKey]?.(ctx))

  const rows = []
  let i = 0
  while (i < visible.length) {
    const a = visible[i]
    const group = a.detail.group
    if (group && visible[i + 1]?.detail?.group === group) {
      rows.push({
        type: 'pair',
        key: group + '-pair',
        items: [_resolveDetailItem(visible[i], ctx), _resolveDetailItem(visible[i + 1], ctx)],
      })
      i += 2
    } else {
      rows.push(_resolveDetailItem(a, ctx))
      i++
    }
  }
  return rows
}

function _resolveDetailItem(action, ctx) {
  const d = action.detail
  const href = d.href?.(ctx) ?? null
  return {
    key: action.key,
    type: href ? 'link' : 'button',
    icon: typeof d.icon === 'function' ? d.icon(ctx) : d.icon,
    label: d.label(ctx),
    color: d.color ?? 'secondary',
    loading: d.loading?.(ctx) ?? false,
    href,
    downloadAttr: d.downloadAttr?.(ctx) ?? null,
    action: () => action.action(ctx),
  }
}

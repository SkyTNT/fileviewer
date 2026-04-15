// Shared helpers for action descriptors.
// All functions read directly from Pinia stores — no ctx argument needed.
//
// file()      — contextMenuFile when set (menu), selectedEntry otherwise (detail)
// selection() — all selected entries
// isTarget()  — contextMenuFile is part of the multi-selection (menu only)
// isMulti()   — more than one entry selected
// canWrite()  — write mode is enabled and not at home
// t(key, …)   — i18n translate (reactive via i18n.global)

import { useFileStore } from '@/plugins/file/store.js'
import i18n from '@/plugins/i18n.js'

export const t         = (...args) => i18n.global.t(...args)
export const file      = () => { const s = useFileStore(); return s.contextMenuFile ?? s.selectedEntry }
export const selection = () => useFileStore().selectedEntries
export const isTarget  = () => useFileStore().isContextMenuTarget
export const isMulti   = () => useFileStore().selectedEntries.length > 1
export const canWrite  = () => { const s = useFileStore(); return s.writeMode && s.currentPath !== '' }

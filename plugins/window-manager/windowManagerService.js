import { reactive, markRaw } from 'vue'

let _nextId = 1
const BASE_Z  = 2000
const CASCADE = 24

export function createWindowManager() {
  const state = reactive({
    windows: [],
    _topZ: BASE_Z,
  })

  function _bringToFront(id) {
    state._topZ++
    const win = state.windows.find(w => w.id === id)
    if (win) {
      win.z = state._topZ
      win.focused = true
      state.windows.forEach(w => { if (w.id !== id) w.focused = false })
    }
  }

  function _defaultPos(w, h) {
    const count  = state.windows.length
    const offset = (count % 8) * CASCADE
    return {
      x: Math.max(0, Math.round((window.innerWidth  - w) / 2) + offset - 84),
      y: Math.max(0, Math.round((window.innerHeight - h) / 2) + offset - 60),
    }
  }

  const manager = {
    get windows() { return state.windows },

    open({ id, title, icon, component, props = {}, width, height, maximized = false }) {
      // If same id already open, just focus it
      if (id) {
        const existing = state.windows.find(w => w.id === id)
        if (existing) {
          existing.minimized = false
          _bringToFront(existing.id)
          return existing.id
        }
      }

      const w = width  ?? 900
      const h = height ?? 600
      const pos = _defaultPos(w, h)
      const winId = id ?? `win-${_nextId++}`

      state._topZ++
      const win = reactive({
        id:        winId,
        title:     title ?? '',
        icon:      icon  ?? 'mdi-window-maximize',
        component: markRaw(component),
        props,
        x: pos.x, y: pos.y,
        w, h,
        z:         state._topZ,
        maximized,
        minimized: false,
        focused:   true,
      })
      state.windows.forEach(w => { w.focused = false })
      state.windows.push(win)
      return winId
    },

    close(id) {
      const idx = state.windows.findIndex(w => w.id === id)
      if (idx >= 0) state.windows.splice(idx, 1)
    },

    focus(id) { _bringToFront(id) },

    minimize(id) {
      const win = state.windows.find(w => w.id === id)
      if (win) win.minimized = !win.minimized
    },

    maximize(id) {
      const win = state.windows.find(w => w.id === id)
      if (win) {
        win.maximized = !win.maximized
        _bringToFront(id)
      }
    },

    setPosition(id, { x, y }) {
      const win = state.windows.find(w => w.id === id)
      if (win) { win.x = x; win.y = y }
    },

    setSize(id, { w, h }) {
      const win = state.windows.find(w => w.id === id)
      if (win) { win.w = w; win.h = h }
    },

    setTitle(id, title) {
      const win = state.windows.find(w => w.id === id)
      if (win) win.title = title
    },

    setProps(id, patch) {
      const win = state.windows.find(w => w.id === id)
      if (win) Object.assign(win.props, patch)
    },

    isOpen(id) {
      return state.windows.some(w => w.id === id)
    },
  }

  return manager
}

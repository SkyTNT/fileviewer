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

  function _defaultPos(w, h, customX, customY) {
    if (customX !== undefined && customY !== undefined) {
      return { x: Math.max(0, customX), y: Math.max(0, customY) }
    }
    const count  = state.windows.length
    const offset = (count % 8) * CASCADE
    return {
      x: Math.max(0, Math.round((window.innerWidth  - w) / 2) + offset),
      y: Math.max(0, Math.round((window.innerHeight - h) / 2) + offset),
    }
  }

  const manager = {
    get windows() { return state.windows },
    get hasVisibleWindow() { return state.windows.some(w => !w.minimized) },

    open({ id, title, icon, component, props = {}, width, height, x, y, maximized = false, noTitleBar = false }) {
      // If same id already open, just focus it
      if (id) {
        const existing = state.windows.find(w => w.id === id)
        if (existing) {
          existing.minimized = false
          _bringToFront(existing.id)
          return existing.id
        }
      }

      const w = Math.min(width ?? 900, window.innerWidth)
      const h = Math.min(height ?? 600, window.innerHeight)
      const pos = _defaultPos(w, h, x, y)
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
        maximized: maximized,
        minimized: false,
        focused:   true,
        noTitleBar,
        closing:      false,
        minimizingOut: false,
        restoring:    false,
        animateMax:   false,
      })
      state.windows.forEach(w => { w.focused = false })
      state.windows.push(win)
      return winId
    },

    close(id) {
      const win = state.windows.find(w => w.id === id)
      if (!win || win.closing) return
      win.closing = true
      setTimeout(() => {
        const idx = state.windows.findIndex(w => w.id === id)
        if (idx >= 0) state.windows.splice(idx, 1)
      }, 180)
    },

    focus(id) { _bringToFront(id) },

    minimize(id) {
      const win = state.windows.find(w => w.id === id)
      if (!win) return
      if (!win.minimized) {
        win.minimized = true
        win.minimizingOut = true
        // Window.vue watches minimizingOut, runs the animation, then clears the flag
      } else {
        win.restoring = true
        win.minimized = false
        _bringToFront(id)
        // Window.vue watches restoring (pre-flush so chip is still queryable),
        // runs the animation, then clears the flag
      }
    },

    maximize(id) {
      const win = state.windows.find(w => w.id === id)
      if (win) {
        win.animateMax = true
        win.maximized = !win.maximized
        _bringToFront(id)
        setTimeout(() => { win.animateMax = false }, 280)
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

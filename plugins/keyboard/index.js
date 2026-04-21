export { manifest } from './manifest.js'

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
let _handler = null

export async function setup(ctx) {
  const winMgr = () => ctx.services.get('window.manager')

  _handler = (e) => {
    const inEditable = EDITABLE.has(e.target?.tagName) || e.target?.isContentEditable
    if (inEditable && e.key !== 'Escape' && !e.key?.startsWith('F')) return

    ctx.events.emit('keyboard:keydown', {
      key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, raw: e,
    })
  }
  window.addEventListener('keydown', _handler)
}

export async function teardown() {
  window.removeEventListener('keydown', _handler)
  _handler = null
}

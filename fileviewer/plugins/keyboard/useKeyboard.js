import { inject, onMounted, onUnmounted } from 'vue'

export function useKeyboard(keys, options = {}) {
  const events = inject('events')

  function handler({ key, raw }) {
    const fn = keys[key]
    if (fn) fn(raw)
  }

  onMounted(()   => events?.on('keyboard:keydown', handler, 'useKeyboard'))
  onUnmounted(() => events?.off('keyboard:keydown', handler))
}

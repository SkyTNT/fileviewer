import { onMounted, onUnmounted } from 'vue'
import { registerKeyboard } from './index.js'

/**
 * Register keyboard shortcuts tied to a component's lifecycle.
 * Shortcuts are active from onMounted to onUnmounted.
 *
 * @param {Record<string, (e: KeyboardEvent) => boolean|void>} keys
 * @param {{ priority?: number, inDialog?: boolean }} [options]
 */
export function useKeyboard(keys, options = {}) {
  let unregister = null
  onMounted(()   => { unregister = registerKeyboard(keys, options) })
  onUnmounted(() => { unregister?.() })
}

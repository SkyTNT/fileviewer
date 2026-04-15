export { VIEWERS } from './descriptors.js'
export { useViewerStore } from './store.js'

export default {
  install() {
    // ViewerPlugin store is initialized on first useViewerStore() call.
  },
}

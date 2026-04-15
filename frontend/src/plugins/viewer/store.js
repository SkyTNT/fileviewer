import { defineStore } from 'pinia'
import { markRaw, shallowRef } from 'vue'
import { VIEWERS } from './descriptors.js'

export const useViewerStore = defineStore('viewer', () => {
  // Component instance refs — populated by App.vue via :ref binding.
  // markRaw prevents Pinia from making this object reactive (which would
  // auto-unwrap the nested refs and break the :ref assignment in App.vue).
  const viewerRefs = markRaw(Object.fromEntries(VIEWERS.map(v => [v.key, shallowRef(null)])))

  // open(target)             — auto-route by file type / shape
  // open(target, { viewer }) — force a specific viewer by key
  // open(target, { mode })   — pass extra options to the viewer's call()
  // open([file1, file2])     — two images → comparison viewer
  function open(target, opts = {}) {
    if (!target) return
    const desc = opts.viewer
      ? VIEWERS.find(v => v.key === opts.viewer)
      : VIEWERS.find(v => v.match(target, opts))
    if (desc) desc.call(viewerRefs[desc.key], target, opts)
  }

  return { VIEWERS, viewerRefs, open }
})

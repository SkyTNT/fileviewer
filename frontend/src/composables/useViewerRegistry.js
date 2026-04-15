import { ref } from 'vue'
import ImageViewer           from '../components/viewers/ImageViewer.vue'
import ImageComparisonViewer from '../components/viewers/ImageComparisonViewer.vue'
import DataFrameViewer       from '../components/viewers/DataFrameViewer.vue'
import JsonViewer            from '../components/viewers/JsonViewer.vue'
import TextViewer            from '../components/viewers/TextViewer.vue'
import MediaPlayer           from '../components/viewers/MediaPlayer.vue'
import HexViewer             from '../components/viewers/HexViewer.vue'
import ArchiveViewer         from '../components/viewers/ArchiveViewer.vue'

// ── Viewer descriptors ────────────────────────────────────────────────────────
//
// To add a new viewer:
//   1. Import the component above
//   2. Add a descriptor to VIEWERS (before the text fallback)
//   3. mount it in App.vue — already handled generically via v-for
//
// Each descriptor:
//   key      — unique string, used as the ref name and for opts.viewer override
//   component — Vue component with defineExpose({ open })
//   match(target) — return true when this viewer handles target naturally
//   call(ref, target, opts) — invoke the viewer's open() with the right args

export const VIEWERS = [
  {
    key: 'comparison',
    component: ImageComparisonViewer,
    match: (target) =>
      Array.isArray(target) &&
      target.length === 2 &&
      target.every(f => f.type === 'image'),
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'image',
    component: ImageViewer,
    match: (target) => !Array.isArray(target) && target?.type === 'image',
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'dataframe',
    component: DataFrameViewer,
    match: (target) => !Array.isArray(target) && ['parquet', 'csv'].includes(target?.type),
    // opts.mode lets callers override the parse format (e.g. 'jsonl' from JsonViewer)
    call: (ref, target, opts) => ref.value?.open(target, opts?.mode ?? target?.type),
  },
  {
    key: 'json',
    component: JsonViewer,
    match: (target) => !Array.isArray(target) && ['json', 'jsonl'].includes(target?.type),
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'media',
    component: MediaPlayer,
    match: (target) => !Array.isArray(target) && ['video', 'audio'].includes(target?.type),
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'archive',
    component: ArchiveViewer,
    match: (target) => !Array.isArray(target) && target?.type === 'archive',
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'hex',
    component: HexViewer,
    // No natural match — only reachable via opts.viewer = 'hex'
    match: () => false,
    call: (ref, target) => ref.value?.open(target),
  },
  // Fallback: anything that isn't a directory
  {
    key: 'text',
    component: TextViewer,
    match: (target) => !Array.isArray(target) && !target?.is_dir,
    call: (ref, target) => ref.value?.open(target),
  },
]

// ── Refs — App.vue binds these via :ref="refs[v.key]" ─────────────────────────
export const refs = Object.fromEntries(VIEWERS.map(v => [v.key, ref(null)]))

// ── Single open function ──────────────────────────────────────────────────────
//
// open(target)               — auto-route by file type / shape
// open(target, { viewer })   — force a specific viewer by key
// open(target, { mode })     — pass extra options to the viewer's call()
// open([file1, file2])       — two images → comparison viewer
//
export function open(target, opts = {}) {
  if (!target) return
  const desc = opts.viewer
    ? VIEWERS.find(v => v.key === opts.viewer)
    : VIEWERS.find(v => v.match(target, opts))
  if (desc) desc.call(refs[desc.key], target, opts)
}

export function useViewerRegistry() {
  return { VIEWERS, refs, open }
}

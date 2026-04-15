import { markRaw } from 'vue'
import ImageViewer           from './viewers/ImageViewer.vue'
import ImageComparisonViewer from './viewers/ImageComparisonViewer.vue'
import DataFrameViewer       from './viewers/DataFrameViewer.vue'
import JsonViewer            from './viewers/JsonViewer.vue'
import TextViewer            from './viewers/TextViewer.vue'
import MediaPlayer           from './viewers/MediaPlayer.vue'
import HexViewer             from './viewers/HexViewer.vue'
import ArchiveViewer         from './viewers/ArchiveViewer.vue'

// Each descriptor:
//   key       — unique string, used as ref name and for opts.viewer override
//   component — Vue component with defineExpose({ open })
//   match(target) — return true when this viewer handles target naturally
//   call(ref, target, opts) — invoke the viewer's open() with the right args
export const VIEWERS = [
  {
    key: 'comparison',
    component: markRaw(ImageComparisonViewer),
    match: (target) =>
      Array.isArray(target) &&
      target.length === 2 &&
      target.every(f => f.type === 'image'),
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'image',
    component: markRaw(ImageViewer),
    match: (target) => !Array.isArray(target) && target?.type === 'image',
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'dataframe',
    component: markRaw(DataFrameViewer),
    match: (target) => !Array.isArray(target) && ['parquet', 'csv'].includes(target?.type),
    call: (ref, target, opts) => ref.value?.open(target, opts?.mode ?? target?.type),
  },
  {
    key: 'json',
    component: markRaw(JsonViewer),
    match: (target) => !Array.isArray(target) && ['json', 'jsonl'].includes(target?.type),
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'media',
    component: markRaw(MediaPlayer),
    match: (target) => !Array.isArray(target) && ['video', 'audio'].includes(target?.type),
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'archive',
    component: markRaw(ArchiveViewer),
    match: (target) => !Array.isArray(target) && target?.type === 'archive',
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'hex',
    component: markRaw(HexViewer),
    match: () => false,
    call: (ref, target) => ref.value?.open(target),
  },
  {
    key: 'text',
    component: markRaw(TextViewer),
    match: (target) => !Array.isArray(target) && !target?.is_dir,
    call: (ref, target) => ref.value?.open(target),
  },
]

export const TYPE_ICON = {
  directory: 'mdi-folder',
  image:     'mdi-image-outline',
  parquet:   'mdi-table-large',
  csv:       'mdi-file-delimited-outline',
  json:      'mdi-code-json',
  jsonl:     'mdi-code-json',
  text:      'mdi-file-document-outline',
  video:     'mdi-play-circle-outline',
  audio:     'mdi-music-note',
  unknown:   'mdi-file-outline',
}

export const TYPE_COLOR = {
  directory: 'primary',
  image:     'success',
  parquet:   'warning',
  csv:       'teal',
  json:      'secondary',
  jsonl:     'secondary',
  text:      'info',
  video:     'deep-purple',
  audio:     'pink',
}

export function formatBytes(bytes, fallback = '') {
  if (bytes == null) return fallback
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

export function formatDate(ts, fallback = '') {
  if (!ts) return fallback
  return new Date(ts * 1000).toLocaleString()
}

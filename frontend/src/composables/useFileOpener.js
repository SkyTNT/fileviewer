import { ref } from 'vue'

export function useFileOpener() {
  const activeViewer = ref(null) // 'image' | 'parquet' | 'json' | 'text' | null
  const activeFile = ref(null)

  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg'])
  const PARQUET_EXT = new Set(['.parquet'])
  const JSON_EXT = new Set(['.json', '.jsonl'])
  const TEXT_EXT = new Set(['.txt', '.yaml', '.yml', '.toml', '.md', '.ini', '.conf', '.log',
    '.xml', '.html', '.css', '.js', '.ts', '.py', '.sh', '.csv', '.rst', '.cfg', '.env'])

  function openFile(file) {
    if (file.is_dir) return
    const ext = (file.extension || '').toLowerCase()
    activeFile.value = file

    if (IMAGE_EXT.has(ext)) {
      activeViewer.value = 'image'
    } else if (PARQUET_EXT.has(ext)) {
      activeViewer.value = 'parquet'
    } else if (JSON_EXT.has(ext)) {
      activeViewer.value = 'json'
    } else if (TEXT_EXT.has(ext)) {
      activeViewer.value = 'text'
    } else {
      activeViewer.value = 'text'
    }
  }

  function closeViewer() {
    activeViewer.value = null
    activeFile.value = null
  }

  return { activeViewer, activeFile, openFile, closeViewer }
}

import { ref } from 'vue'

export function useFileOpener() {
  const activeViewer = ref(null) // 'image' | 'parquet' | 'json' | 'text' | 'video' | 'audio' | null
  const activeFile = ref(null)

  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg'])
  const PARQUET_EXT = new Set(['.parquet'])
  const JSON_EXT = new Set(['.json', '.jsonl'])
  const TEXT_EXT = new Set(['.txt', '.yaml', '.yml', '.toml', '.md', '.ini', '.conf', '.log',
    '.xml', '.html', '.css', '.js', '.py', '.sh', '.csv', '.rst', '.cfg', '.env'])
  const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v', '.ts'])
  const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.opus', '.wma'])

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
    } else if (VIDEO_EXT.has(ext)) {
      activeViewer.value = 'video'
    } else if (AUDIO_EXT.has(ext)) {
      activeViewer.value = 'audio'
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

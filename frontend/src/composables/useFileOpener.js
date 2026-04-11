import { ref } from 'vue'

export function useFileOpener() {
  const activeViewer = ref(null)
  const activeFile   = ref(null)

  function openFile(file) {
    if (file.is_dir) return
    activeFile.value   = file
    activeViewer.value = file.type ?? 'text'
  }

  function closeViewer() {
    activeViewer.value = null
    activeFile.value   = null
  }

  return { activeViewer, activeFile, openFile, closeViewer }
}

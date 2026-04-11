import { ref } from 'vue'
import { useFileStore } from '../stores/fileStore.js'

export function useMultiDelete(onError) {
  const store = useFileStore()
  const multiDeleteDialog  = ref(false)
  const multiDeleteTargets = ref([])

  function openMultiDelete(entries) {
    multiDeleteTargets.value = entries
    multiDeleteDialog.value  = true
  }

  async function confirmMultiDelete() {
    const targets = multiDeleteTargets.value
    multiDeleteDialog.value = false
    try {
      await store.deleteEntries(targets)
    } catch (e) {
      onError?.(e.response?.data?.detail || e.message)
    }
  }

  return { multiDeleteDialog, multiDeleteTargets, openMultiDelete, confirmMultiDelete }
}

import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { writeApi } from '@/services/api.js'
import { useFileStore } from '@/plugins/file/store.js'

export const useUploadStore = defineStore('upload', () => {
  const uploadTasks        = ref([])
  const _uploadFiles       = new Map()
  const _uploadControllers = new Map()
  let _uploadNextId = 1
  let _uploadRafId  = null

  async function _uploadFile(task) {
    const fileStore  = useFileStore()
    const file       = _uploadFiles.get(task.id)
    const controller = new AbortController()
    _uploadControllers.set(task.id, controller)
    try {
      await writeApi.upload(task.parent, file, task.onConflict, {
        signal: controller.signal,
        onUploadProgress: (e) => {
          if (e.total) task.progress = Math.round(e.loaded / e.total * 100)
        },
      })
      task.progress = 100
      task.status   = 'done'
    } catch (err) {
      if (err.code === 'ERR_CANCELED') {
        uploadTasks.value = uploadTasks.value.filter(t => t.id !== task.id)
        return
      }
      task.status = 'error'
      task.error  = err.response?.data?.detail || err.message || 'Upload failed'
    } finally {
      _uploadFiles.delete(task.id)
      _uploadControllers.delete(task.id)
    }
    if (task.status === 'done') _scheduleRefresh()
  }

  function _scheduleRefresh() {
    if (_uploadRafId) return
    _uploadRafId = requestAnimationFrame(() => {
      _uploadRafId = null
      useFileStore().refresh()
    })
  }

  function _startUploads(parent, files, onConflict) {
    files.forEach((file) => {
      const id   = _uploadNextId++
      const task = reactive({ id, name: file.name, parent, onConflict, progress: 0, status: 'uploading', error: null })
      _uploadFiles.set(id, file)
      uploadTasks.value.push(task)
      _uploadFile(task)
    })
  }

  async function addUploads(parent, files) {
    const fileStore = useFileStore()
    try {
      const res  = await writeApi.checkConflicts(files.map(f => ({ name: f.name, dest_parent: parent })))
      const data = res.data

      if (data.conflicts?.length > 0) {
        const strategy = await new Promise((resolve) => {
          fileStore.nameConflicts = { conflicts: data.conflicts, resolve }
        })
        if (!strategy) return
        if (strategy === 'skip') {
          const conflictNames = new Set(data.conflicts.map(c => c.name))
          const toUpload = files.filter(f => !conflictNames.has(f.name))
          if (toUpload.length) _startUploads(parent, toUpload, 'overwrite')
        } else {
          _startUploads(parent, files, strategy)
        }
        return
      }
    } catch {
      // If conflict check fails, proceed with default overwrite
    }

    _startUploads(parent, files, 'overwrite')
  }

  function clearUploadsDone() {
    uploadTasks.value = uploadTasks.value.filter(t => t.status === 'uploading')
  }

  function clearAllUploads() {
    uploadTasks.value = []
  }

  function removeUploadTask(id) {
    const controller = _uploadControllers.get(id)
    if (controller) { controller.abort(); return }
    uploadTasks.value = uploadTasks.value.filter(t => t.id !== id)
    _uploadFiles.delete(id)
  }

  return {
    uploadTasks,
    addUploads, clearUploadsDone, clearAllUploads, removeUploadTask,
  }
})

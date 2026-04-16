import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { writeApi } from '@/services/api.js'
import { useFileStore } from '@/plugins/file/store.js'
import { useTaskStore } from '@/plugins/task/store.js'
import UploadTaskItem from './UploadTaskItem.vue'

export const useUploadStore = defineStore('upload', () => {
  const _controllers = new Map()   // fileEntryId → AbortController
  let _nextFileId = 1
  let _rafId      = null

  async function _uploadFile(batchTask, fileEntry) {
    const controller = new AbortController()
    _controllers.set(fileEntry.id, controller)
    try {
      await writeApi.upload(fileEntry.parent, fileEntry.file, fileEntry.onConflict, {
        signal: controller.signal,
        onUploadProgress: (e) => {
          if (e.total) fileEntry.progress = Math.round(e.loaded / e.total * 100)
        },
      })
      fileEntry.progress = 100
      fileEntry.status   = 'done'
    } catch (err) {
      if (err.code === 'ERR_CANCELED') {
        // Remove canceled file from the batch list
        batchTask.data.files = batchTask.data.files.filter(f => f.id !== fileEntry.id)
      } else {
        fileEntry.status = 'error'
        fileEntry.error  = err.response?.data?.detail || err.message || 'Upload failed'
      }
    } finally {
      _controllers.delete(fileEntry.id)
    }

    if (fileEntry.status === 'done') _scheduleRefresh()

    // Mark batch done when all files settled
    const allSettled = batchTask.data.files.every(f => f.status !== 'uploading')
    if (allSettled) {
      const hasErrors = batchTask.data.files.some(f => f.status === 'error')
      batchTask.status = hasErrors ? 'error' : 'done'
    }
  }

  function _scheduleRefresh() {
    if (_rafId) return
    _rafId = requestAnimationFrame(() => {
      _rafId = null
      useFileStore().refresh()
    })
  }

  function _startUploads(parent, files, onConflict) {
    const taskStore  = useTaskStore()
    const fileEntries = files.map(file => reactive({
      id: _nextFileId++,
      name: file.name,
      file,
      parent,
      onConflict,
      progress: 0,
      status: 'uploading',
      error: null,
    }))

    const batchData = reactive({ files: fileEntries })
    const batchTask = taskStore.add({ component: UploadTaskItem, data: batchData })

    // Attach remove helper after batchTask is created so the closure captures it
    batchData.removeFile = (fileId) => {
      const entry = batchData.files.find(f => f.id === fileId)
      if (entry?.status === 'uploading') {
        _controllers.get(fileId)?.abort()
        // Cancellation is handled in the catch block of _uploadFile
      } else {
        batchData.files = batchData.files.filter(f => f.id !== fileId)
        const allSettled = batchData.files.every(f => f.status !== 'uploading')
        if (allSettled || batchData.files.length === 0) {
          const hasErrors = batchData.files.some(f => f.status === 'error')
          batchTask.status = hasErrors ? 'error' : 'done'
        }
      }
    }

    fileEntries.forEach(entry => _uploadFile(batchTask, entry))
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

  return { addUploads }
})

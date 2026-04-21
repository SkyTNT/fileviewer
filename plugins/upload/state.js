import { reactive } from 'vue'
import UploadTaskItem from './UploadTaskItem.vue'
export function createUploadState(explorerState, taskState, winMgr, writeApi, openConflictDialog) {
  const _controllers = new Map()
  let _nextFileId = 1
  let _rafId      = null

  async function _uploadFile(batchTask, fileEntry) {
    const controller = new AbortController()
    _controllers.set(fileEntry.id, controller)
    try {
      let offset = 0
      try {
        const res = await writeApi.uploadStatus(fileEntry.parent, fileEntry.file.name)
        const reported = res.data.offset ?? 0
        if (reported > 0 && reported < fileEntry.file.size) {
          offset              = reported
          fileEntry.resumeOffset = offset
          fileEntry.progress  = Math.round(offset / fileEntry.file.size * 100)
        }
      } catch { /* no partial — start fresh */ }

      const res = await writeApi.uploadStream(
        fileEntry.parent,
        fileEntry.file,
        offset,
        fileEntry.onConflict,
        controller.signal,
        (sent, total) => { fileEntry.progress = Math.round(sent / total * 100) },
      )

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${res.status}`)
      }

      fileEntry.progress = 100
      fileEntry.status   = 'done'
    } catch (err) {
      if (err.name === 'AbortError') {
        batchTask.data.files = batchTask.data.files.filter(f => f.id !== fileEntry.id)
      } else {
        fileEntry.status = 'error'
        fileEntry.error  = err.message || 'Upload failed'
      }
    } finally {
      _controllers.delete(fileEntry.id)
    }

    if (fileEntry.status === 'done') _scheduleRefresh()

    const allSettled = batchTask.data.files.every(f => f.status !== 'uploading')
    if (allSettled) {
      batchTask.status = batchTask.data.files.some(f => f.status === 'error') ? 'error' : 'done'
    }
  }

  function _scheduleRefresh() {
    if (_rafId) return
    _rafId = requestAnimationFrame(() => { _rafId = null; explorerState.refresh() })
  }

  function _startUploads(parent, files, onConflict) {
    const fileEntries = files.map(file => reactive({
      id:           _nextFileId++,
      name:         file.name,
      file,
      parent,
      onConflict,
      progress:     0,
      resumeOffset: 0,
      status:       'uploading',
      error:        null,
    }))

    const batchData = reactive({ files: fileEntries })
    const batchTask = taskState.add({ component: UploadTaskItem, data: batchData })

    batchData.removeFile = (fileId) => {
      const entry = batchData.files.find(f => f.id === fileId)
      if (entry?.status === 'uploading') {
        _controllers.get(fileId)?.abort()
      } else {
        batchData.files = batchData.files.filter(f => f.id !== fileId)
        const allSettled = batchData.files.every(f => f.status !== 'uploading')
        if (allSettled || !batchData.files.length) {
          batchTask.status = batchData.files.some(f => f.status === 'error') ? 'error' : 'done'
        }
      }
    }

    fileEntries.forEach(entry => _uploadFile(batchTask, entry))
  }

  async function addUploads(parent, files) {
    try {
      const res  = await writeApi.checkConflicts(files.map(f => ({ name: f.name, dest_parent: parent })))
      const data = res.data
      if (data.conflicts?.length > 0) {
        const strategy = await openConflictDialog(data.conflicts)
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
    } catch { /* conflict check failed — proceed with overwrite */ }
    _startUploads(parent, files, 'overwrite')
  }

  return { addUploads }
}

// Reverse proxies / gateways in front of the server often cap request body size
// (e.g. nginx client_max_body_size, CDN limits), so large files are sent as a
// series of bounded chunks rather than a single request for the whole file.
// Chunks are written to fixed byte offsets server-side (not appended), so several
// can be uploaded concurrently to make better use of available bandwidth.
const UPLOAD_CHUNK_SIZE = 64 * 1024 * 1024
const UPLOAD_CONCURRENCY = 4
const UPLOAD_MAX_RETRIES = 3

function isRangeCovered(ranges, start, end) {
  return ranges.some(([s, e]) => s <= start && e >= end)
}

export function createWriteApi(http, httpStream) {
  function sendUploadChunk(parent, file, start, end, onConflict, signal, onProgress) {
    const params = new URLSearchParams({
      parent, filename: file.name, offset: String(start),
      length: String(end - start), total: String(file.size), on_conflict: onConflict,
    })
    const chunk = file.slice(start, end)
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/write/upload-stream?${params}`)
      xhr.withCredentials = true
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      if (onProgress) xhr.upload.onprogress = e => onProgress(e.loaded)
      const onAbort = () => xhr.abort()
      const cleanup = () => signal?.removeEventListener('abort', onAbort)
      signal?.addEventListener('abort', onAbort)
      xhr.onload = () => {
        cleanup()
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          json: () => { try { return Promise.resolve(JSON.parse(xhr.responseText)) } catch { return Promise.resolve({}) } },
        })
      }
      xhr.onerror = () => { cleanup(); reject(new Error('Network error')) }
      xhr.onabort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')) }
      xhr.send(chunk)
    })
  }

  return {
    mkdir:  (parent, name)   => http.post('/write/mkdir',  { parent, name }),
    touch:  (parent, name)   => http.post('/write/touch',  { parent, name }),
    rename: (path, new_name) => http.post('/write/rename', { path, new_name }),
    save:   (path, content)  => http.post('/write/save',   { path, content }),
    uploadStatus: (parent, filename, total) =>
      http.get('/write/upload-status', { params: { parent, filename, total } }),
    uploadStream: async (parent, file, onConflict, signal, onProgress) => {
      let ranges = []
      try {
        const status = await http.get('/write/upload-status', { params: { parent, filename: file.name, total: file.size } })
        ranges = status.data.ranges || []
      } catch { /* treat as a fresh upload */ }

      const chunks = []
      if (file.size === 0) {
        chunks.push({ start: 0, end: 0 })
      } else {
        for (let start = 0; start < file.size; start += UPLOAD_CHUNK_SIZE) {
          const end = Math.min(start + UPLOAD_CHUNK_SIZE, file.size)
          if (!isRangeCovered(ranges, start, end)) chunks.push({ start, end })
        }
        // Every chunk was already covered server-side (e.g. the previous attempt
        // finished writing but the client never saw the "done" response) — send an
        // empty probe at EOF so the server can finalize (rename) the upload.
        if (!chunks.length) chunks.push({ start: file.size, end: file.size })
      }

      const coveredBytes = ranges.reduce((sum, [s, e]) => sum + (e - s), 0)
      const sentPerChunk = new Array(chunks.length).fill(0)
      const reportProgress = () => {
        if (!onProgress) return
        onProgress(coveredBytes + sentPerChunk.reduce((a, b) => a + b, 0), file.size)
      }

      const localController = new AbortController()
      const forwardAbort = () => localController.abort()
      signal?.addEventListener('abort', forwardAbort)

      let settled = null
      const finish = (outcome) => { if (!settled) { settled = outcome; localController.abort() } }

      let nextIndex = 0
      async function worker() {
        while (!settled) {
          const i = nextIndex++
          if (i >= chunks.length) return
          const { start, end } = chunks[i]
          let attempt = 0
          for (;;) {
            try {
              const res = await sendUploadChunk(
                parent, file, start, end, onConflict, localController.signal,
                sent => { sentPerChunk[i] = sent; reportProgress() },
              )
              sentPerChunk[i] = end - start
              reportProgress()
              if (!res.ok) { finish({ res }); return }
              const body = await res.json()
              if (body.done) finish({ res })
              break
            } catch (err) {
              if (err.name === 'AbortError') return
              if (++attempt > UPLOAD_MAX_RETRIES) { finish({ err }); return }
            }
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, chunks.length) }, worker))
      signal?.removeEventListener('abort', forwardAbort)

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (!settled) throw new Error('Upload did not complete')
      if (settled.err) throw settled.err
      return settled.res
    },
    checkConflicts: (entries) => http.post('/write/check-conflicts', { entries }),
    paste: (entries, action, destParent, onConflict, signal = undefined) =>
      httpStream.post('/write/paste', {
        entries: entries.map(e => ({ src: e.path, dest_parent: destParent })),
        action: action === 'cut' ? 'move' : action, on_conflict: onConflict,
      }, signal ? { signal } : {}),
    symlink: (entries, destParent, onConflict, signal = undefined) =>
      httpStream.post('/write/symlink', {
        entries: entries.map(e => ({ src: e.path, dest_parent: destParent })),
        on_conflict: onConflict,
      }, signal ? { signal } : {}),
    delete: (paths) => httpStream.post('/write/delete', { paths }),
  }
}

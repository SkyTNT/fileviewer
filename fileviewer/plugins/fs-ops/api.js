export function createWriteApi(http, httpStream) {
  return {
    mkdir:  (parent, name)   => http.post('/write/mkdir',  { parent, name }),
    touch:  (parent, name)   => http.post('/write/touch',  { parent, name }),
    rename: (path, new_name) => http.post('/write/rename', { path, new_name }),
    save:   (path, content)  => http.post('/write/save',   { path, content }),
    uploadStatus: (parent, filename) =>
      http.get('/write/upload-status', { params: { parent, filename } }),
    uploadStream: (parent, file, offset, onConflict, signal, onProgress) => {
      const params = new URLSearchParams({
        parent, filename: file.name, offset: String(offset),
        total: String(file.size), on_conflict: onConflict,
      })
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `/api/write/upload-stream?${params}`)
        xhr.withCredentials = true
        xhr.setRequestHeader('Content-Type', 'application/octet-stream')
        if (onProgress) xhr.upload.onprogress = e => onProgress(offset + e.loaded, file.size)
        signal?.addEventListener('abort', () => xhr.abort())
        xhr.onload = () => resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          json: () => { try { return Promise.resolve(JSON.parse(xhr.responseText)) } catch { return Promise.resolve({}) } },
        })
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
        xhr.send(file.slice(offset))
      })
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

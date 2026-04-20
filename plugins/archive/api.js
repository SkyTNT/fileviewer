export function createArchiveApi(http, httpStream) {
  return {
    getInfo: (path, password = null, signal = undefined) => {
      let url = `/archive/info?path=${encodeURIComponent(path)}`
      if (password) url += `&password=${encodeURIComponent(password)}`
      return httpStream.get(url, signal ? { signal } : {})
    },
    entryUrl: (path, entry, password = null) => {
      let url = `/api/archive/entry?path=${encodeURIComponent(path)}&entry=${encodeURIComponent(entry)}`
      if (password) url += `&password=${encodeURIComponent(password)}`
      return url
    },
    getEntryText: (path, entry, password = null) =>
      http.get('/archive/entry', {
        params: { path, entry, ...(password && { password }) },
        responseType: 'text',
      }).then(r => r.data),
    getCapabilities: () => http.get('/archive/capabilities'),
    checkConflicts: (path, dest, password = null, entries = null) =>
      http.post('/archive/conflicts', { path, dest, password, entries }),
    extract: (path, dest, password = null, entries = null, conflictStrategy = 'overwrite', signal = undefined) =>
      httpStream.post('/archive/extract', { path, dest, password, entries, conflict_strategy: conflictStrategy }, signal ? { signal } : {}),
    create: (sources, outputPath, format, level, password, excludes, signal = undefined) =>
      httpStream.post('/archive/create', {
        sources, output_path: outputPath, format, level,
        password: password || null, excludes: excludes || [],
      }, signal ? { signal } : {}),
  }
}

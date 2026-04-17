import axios from 'axios'

const http = axios.create({ baseURL: '/api', withCredentials: true })

http.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('fv:unauthorized'))
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  status:  ()                   => http.get('/auth/status'),
  login:   (username, password) => http.post('/auth/login', { username, password }),
  logout:  ()                   => http.post('/auth/logout'),
}

export const configApi = {
  getConfig: () => http.get('/config'),
}

export const filesApi = {
  listDirectory: (path, page = 1, pageSize = 50, filter = null, sortBy = 'name', sortOrder = 'asc') =>
    http.get('/files/list', { params: { path, page, page_size: pageSize, ...(filter ? { filter } : {}), sort_by: sortBy, sort_order: sortOrder } }),
  getTree: (path, depth = 1, sortBy = 'name', sortOrder = 'asc') => http.get('/files/tree', { params: { path, depth, sort_by: sortBy, sort_order: sortOrder } }),
  downloadUrl: (path) => `/api/files/download?path=${encodeURIComponent(path)}`,
  download: (path) => http.get('/files/download', { params: { path }, responseType: 'arraybuffer' }),
}

export const imagesApi = {
  thumbnailUrl: (path, size = 300) =>
    `/api/images/thumbnail?path=${encodeURIComponent(path)}&size=${size}`,
  fullUrl: (path) =>
    `/api/images/full?path=${encodeURIComponent(path)}`,
  full: (path) => http.get('/images/full', { params: { path }, responseType: 'blob' }),
}

export const dataframeApi = {
  getSchema:       (path)         => http.get('/dataframe/schema', { params: { path } }),
  getData:         (path, params) => http.get('/dataframe/data',   { params: { path, ...params } }),
  detectImageCols: (path)         => http.get('/dataframe/detect-image-cols', { params: { path } }),
}

export const textApi = {
  getContent: (path) => http.get('/text/content', { params: { path } }),
}

export const hexApi = {
  getDump: (path, page = 1) => http.get('/hex/dump', { params: { path, page } }),
}

export const mediaApi = {
  streamUrl: (path) => `/api/media/stream?path=${encodeURIComponent(path)}`,
}

export const archiveApi = {
  getInfo: (path, password = null, signal = undefined) => {
    let url = `/api/archive/info?path=${encodeURIComponent(path)}`
    if (password) url += `&password=${encodeURIComponent(password)}`
    return fetch(url, { credentials: 'include', ...(signal && { signal }) })
  },

  entryUrl: (path, entry, password = null) => {
    let url = `/api/archive/entry?path=${encodeURIComponent(path)}&entry=${encodeURIComponent(entry)}`
    if (password) url += `&password=${encodeURIComponent(password)}`
    return url
  },

  getEntryText: async (path, entry, password = null) => {
    const url = `/api/archive/entry?path=${encodeURIComponent(path)}&entry=${encodeURIComponent(entry)}${password ? `&password=${encodeURIComponent(password)}` : ''}`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    return res.text()
  },

  getCapabilities: () => http.get('/archive/capabilities'),

  checkConflicts: (path, dest, password = null, entries = null) =>
    http.post('/archive/conflicts', { path, dest, password, entries }),

  extract: (path, dest, password = null, entries = null, conflictStrategy = 'overwrite') =>
    fetch('/api/archive/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path, dest, password, entries, conflict_strategy: conflictStrategy }),
    }),

  create: (sources, outputPath, format, level, password, excludes, signal = undefined) =>
    fetch('/api/archive/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...(signal && { signal }),
      body: JSON.stringify({
        sources,
        output_path: outputPath,
        format,
        level,
        password: password || null,
        excludes: excludes || [],
      }),
    }),
}

export const writeApi = {
  mkdir:  (parent, name)              => http.post('/write/mkdir',  { parent, name }),
  touch:  (parent, name)              => http.post('/write/touch',  { parent, name }),
  rename: (path, new_name)            => http.post('/write/rename', { path, new_name }),
  save:   (path, content)             => http.post('/write/save',   { path, content }),
  upload: (parent, file, onConflict = 'overwrite', options = {}) => {
    const fd = new FormData()
    fd.append('parent', parent)
    fd.append('files', file)
    fd.append('on_conflict', onConflict)
    return http.post('/write/upload', fd, options)
  },
  checkConflicts: (entries) =>
    http.post('/write/check-conflicts', { entries }),
  paste: (entries, action, destParent, onConflict) =>
    fetch('/api/write/paste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entries: entries.map(e => ({ src: e.path, dest_parent: destParent })),
        action,
        on_conflict: onConflict,
      }),
    }),
  symlink: (entries, destParent, onConflict) =>
    fetch('/api/write/symlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entries: entries.map(e => ({ src: e.path, dest_parent: destParent })),
        on_conflict: onConflict,
      }),
    }),
  delete: (paths) =>
    fetch('/api/write/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ paths }),
    }),
}

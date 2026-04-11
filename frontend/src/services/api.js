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
  getRoot: () => http.get('/root'),
  listDirectory: (path, page = 1, pageSize = 50, filter = null) =>
    http.get('/files/list', { params: { path, page, page_size: pageSize, ...(filter ? { filter } : {}) } }),
  getTree: (path, depth = 1) => http.get('/files/tree', { params: { path, depth } }),
  downloadUrl: (path) => `/api/files/download?path=${encodeURIComponent(path)}`,
}

export const imagesApi = {
  thumbnailUrl: (path, size = 300) =>
    `/api/images/thumbnail?path=${encodeURIComponent(path)}&size=${size}`,
  fullUrl: (path) =>
    `/api/images/full?path=${encodeURIComponent(path)}`,
  getDimensions: (path) => http.get('/images/dimensions', { params: { path } }),
}

export const parquetApi = {
  getSchema: (path) => http.get('/parquet/schema', { params: { path } }),
  getData: (path, params = {}) => http.get('/parquet/data', { params: { path, ...params } }),
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

export const writeApi = {
  mkdir:  (parent, name)              => http.post('/write/mkdir',  { parent, name }),
  touch:  (parent, name)              => http.post('/write/touch',  { parent, name }),
  rename: (path, new_name)            => http.post('/write/rename', { path, new_name }),
  delete: (path)                      => http.delete('/write/delete', { params: { path } }),
  save:   (path, content)             => http.post('/write/save',   { path, content }),
  copy:   (src, dest_parent)          => http.post('/write/copy',   { src, dest_parent }),
  move:   (src, dest_parent)          => http.post('/write/move',   { src, dest_parent }),
  upload: (parent, files)      => {
    const fd = new FormData()
    fd.append('parent', parent)
    for (const f of files) fd.append('files', f)
    return http.post('/write/upload', fd)
  },
}

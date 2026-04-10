import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

export const filesApi = {
  getRoot: () => http.get('/root'),
  listDirectory: (path, page = 1, pageSize = 50) =>
    http.get('/files/list', { params: { path, page, page_size: pageSize } }),
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

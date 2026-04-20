export function createFilesApi(http) {
  return {
    listDirectory: (path, page = 1, pageSize = 50, filter = null, sortBy = 'name', sortOrder = 'asc') =>
      http.get('/files/list', { params: { path, page, page_size: pageSize, ...(filter ? { filter } : {}), sort_by: sortBy, sort_order: sortOrder } }),
    getTree: (path, depth = 1, sortBy = 'name', sortOrder = 'asc') =>
      http.get('/files/tree', { params: { path, depth, sort_by: sortBy, sort_order: sortOrder } }),
    downloadUrl: (path) => `/api/files/download?path=${encodeURIComponent(path)}`,
    download: (path) => http.get('/files/download', { params: { path }, responseType: 'arraybuffer' }),
  }
}

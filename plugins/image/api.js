export function createImagesApi(http) {
  return {
    thumbnailUrl: (path, size = 300) =>
      `/api/images/thumbnail?path=${encodeURIComponent(path)}&size=${size}`,
    fullUrl: (path) =>
      `/api/images/full?path=${encodeURIComponent(path)}`,
    full: (path) => http.get('/images/full', { params: { path }, responseType: 'blob' }),
    psdLayers: (path) => http.get('/images/psd-layers', { params: { path } }),
  }
}

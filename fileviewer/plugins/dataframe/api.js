export function createDataframeApi(http) {
  return {
    getSchema:       (path)         => http.get('/dataframe/schema', { params: { path } }),
    getData:         (path, params) => http.get('/dataframe/data',   { params: { path, ...params } }),
    detectImageCols: (path)         => http.get('/dataframe/detect-image-cols', { params: { path } }),
  }
}

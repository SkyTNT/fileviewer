export function createTextApi(http) {
  return {
    getContent: (path) => http.get('/text/content', { params: { path } }),
    save:       (path, content) => http.post('/text/save', { path, content }),
  }
}

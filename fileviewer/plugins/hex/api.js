export function createHexApi(http) {
  return {
    getDump: (path, page = 1) => http.get('/hex/dump', { params: { path, page } }),
  }
}

export function createAuthApi(http) {
  return {
    status:  ()                   => http.get('/auth/status'),
    login:   (username, password) => http.post('/auth/login', { username, password }),
    logout:  ()                   => http.post('/auth/logout'),
  }
}

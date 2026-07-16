import axios from 'axios'

const http = axios.create({ baseURL: '/api', withCredentials: true })

http.interceptors.response.use(r => r, err => Promise.reject(err))

export const httpStream = {
  get: (path, options = {}) =>
    fetch(`/api${path}`, { credentials: 'include', ...options }),
  post: (path, body = {}, options = {}) =>
    fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      ...options,
    }),
}

export default http

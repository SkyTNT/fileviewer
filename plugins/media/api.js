export function createMediaApi() {
  return {
    streamUrl: (path) => `/api/media/stream?path=${encodeURIComponent(path)}`,
  }
}

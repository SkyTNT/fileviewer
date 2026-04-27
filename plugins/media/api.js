export function createMediaApi() {
  return {
    streamUrl: (path) => `/api/media/stream?path=${encodeURIComponent(path)}`,
    thumbnailUrl: (path, size = 300) => `/api/media/thumbnail?path=${encodeURIComponent(path)}&size=${size}`,
  }
}

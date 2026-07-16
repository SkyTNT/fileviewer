export function createMidiApi(http) {
  return {
    rawUrl: (path) => `/api/midi/raw?path=${encodeURIComponent(path)}`,
    save: (path, base64Data) => http.post('/midi/save', { path, data: base64Data }),
  }
}

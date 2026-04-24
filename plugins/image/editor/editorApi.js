export function createEditorApi() {
  return {
    async saveImage(path, blob) {
      const res = await fetch(`/api/images/save?path=${encodeURIComponent(path)}`, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': blob.type || 'image/png' },
        credentials: 'include',
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },

    async saveImageAs(parentPath, filename, blob) {
      const qs = new URLSearchParams({ parent: parentPath, filename })
      const res = await fetch(`/api/images/save-as?${qs}`, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': blob.type || 'image/png' },
        credentials: 'include',
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },

    async applyFilter(blob, filterId, params = {}) {
      const qs = new URLSearchParams({ filter: filterId, params: JSON.stringify(params) })
      const res = await fetch(`/api/images/filter?${qs}`, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': 'image/png' },
        credentials: 'include',
      })
      if (!res.ok) throw new Error(await res.text())
      return res.blob()
    },
  }
}

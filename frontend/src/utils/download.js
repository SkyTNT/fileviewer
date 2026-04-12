import { filesApi } from '../services/api.js'

/**
 * Trigger browser download for one or more files.
 * @param {Array<{path: string, name: string}>} files
 */
export function downloadFiles(files) {
  files.forEach(f => {
    const a = document.createElement('a')
    a.href = filesApi.downloadUrl(f.path)
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  })
}

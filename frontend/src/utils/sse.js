export async function readSSE(response, onEvent) {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Request failed: ${response.status}`)
  }
  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()
    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data:')) continue
      try { onEvent(JSON.parse(line.slice(5).trim())) } catch {}
    }
  }
}

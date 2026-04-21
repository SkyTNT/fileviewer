export function getErrorMessage(e) {
  return e.response?.data?.detail || e.message
}

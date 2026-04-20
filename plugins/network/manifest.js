export const manifest = {
  id: 'network',
  name: 'Network',
  version: '1.0.0',
  provides: { services: ['network.http', 'network.httpStream', 'network.sse'] },
  requires: { services: [], plugins: [] },
}

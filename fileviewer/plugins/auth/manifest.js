export const manifest = {
  id: 'auth',
  name: 'Auth',
  version: '1.0.0',
  provides: { services: ['auth.state'] },
  requires: { services: ['network.http'], plugins: [] },
}

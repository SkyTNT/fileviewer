export const manifest = {
  id: 'fs_local',
  name: 'Local Filesystem',
  version: '1.0.0',
  provides: { services: ['files.api'] },
  requires: { services: ['network.http'], plugins: [] },
}

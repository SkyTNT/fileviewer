import { manifest } from './manifest.js'
export { manifest }

export async function setup(ctx) {
  const ft = await ctx.services.getAsync('file.types')
  ft.register('directory', 'mdi-folder',     'primary')
  ft.register('unknown',   'mdi-file-outline', null)
}

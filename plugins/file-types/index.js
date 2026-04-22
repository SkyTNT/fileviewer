import { manifest } from './manifest.js'
export { manifest }

export async function setup(ctx) {
  const ft = await ctx.services.getAsync('file.types')
  ft.register('directory', 'mdi-folder',                 'primary')
  ft.register('image',     'mdi-image-outline',          'success')
  ft.register('parquet',   'mdi-table-large',            'warning')
  ft.register('csv',       'mdi-file-delimited-outline', 'teal')
  ft.register('json',      'mdi-code-json',              'secondary')
  ft.register('jsonl',     'mdi-code-json',              'secondary')
  ft.register('text',      'mdi-file-document-outline',  'info')
  ft.register('video',     'mdi-play-circle-outline',    'deep-purple')
  ft.register('audio',     'mdi-music-note',             'pink')
  ft.register('archive',   'mdi-archive-outline',        'orange')
  ft.register('unknown',   'mdi-file-outline',           null)
}

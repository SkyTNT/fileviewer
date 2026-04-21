import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

function preloadAllChunks() {
  return {
    name: 'preload-all-chunks',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        const existingJs = new Set(
          [...html.matchAll(/modulepreload[^>]+href="([^"]+)"/g)].map(m => m[1])
        )
        const existingCss = new Set(
          [...html.matchAll(/stylesheet[^>]+href="([^"]+)"/g)].map(m => m[1])
        )
        const jsTags = Object.entries(ctx.bundle)
          .filter(([, chunk]) => chunk.type === 'chunk')
          .map(([fileName]) => `/${fileName}`)
          .filter(href => !existingJs.has(href))
          .map(href => `    <link rel="modulepreload" crossorigin href="${href}">`)
          .join('\n')
        const cssTags = Object.entries(ctx.bundle)
          .filter(([, asset]) => asset.type === 'asset' && asset.fileName.endsWith('.css'))
          .map(([fileName]) => `/${fileName}`)
          .filter(href => !existingCss.has(href))
          .map(href => `    <link rel="stylesheet" crossorigin href="${href}">`)
          .join('\n')
        return html.replace('</head>', `${jsTags}\n${cssTags}\n  </head>`)
      }
    }
  }
}

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    preloadAllChunks(),
  ],
  build: {
    outDir: 'static',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('vuetify')) return 'vuetify'
            if (id.includes('codemirror') || id.includes('@codemirror')) return 'codemirror'
            return 'vendor'
          }
        }
      }
    }
  },
  optimizeDeps: {
    include: [
      'vuetify/components/VNavigationDrawer',
      'vuetify/components/VMain',
      'vuetify/components/VBreadcrumbs',
      'vuetify/components/VMenu',
      'vuetify/components/VAppBar',
      'vuetify/components/VBtnToggle',
      'vuetify/components/VAvatar',
      'vuetify/components/VSnackbar',
      'vuetify/directives',
    ],
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
})

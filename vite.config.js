import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'Smart Life Dashboard',
        short_name: 'Smart Life',
        description: 'Dashboard mobile-first pour gérer tâches, rendez-vous, groupes et finances.',
        theme_color: '#0b0f1a',
        background_color: '#05070d',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'fr-FR',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173 },
  build: { target: 'esnext', sourcemap: false },
})

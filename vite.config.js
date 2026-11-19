import 'dotenv/config'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const apiPort = Number(process.env.PORT || 3000)
const webPort = Number(process.env.VITE_PORT || 5173)

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'MariachiTotal',
        short_name: 'MariachiTotal',
        description: 'Agenda, clientes y finanzas para mariachi',
        lang: 'es-MX',
        theme_color: '#6d28d9',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/q\//, /^\/e\//, /^\/api\//],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}']
      }
    })
  ],
  server: {
    port: webPort,
    proxy: { '/api': `http://localhost:${apiPort}` }
  }
})

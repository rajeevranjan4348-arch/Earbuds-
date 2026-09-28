import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

// Populate process.env from .env / .env.local so the Node-side API middleware
// (mounted below) sees the same secrets as the standalone production server.
import { loadEnv as loadIrisEnv } from './src/server/env'
import { hydrateRuntimeKeys } from './src/server/keyStore'

loadIrisEnv()
hydrateRuntimeKeys()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'Logo.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        id: '/',
        name: 'IRIS AI - Voice Operating System',
        short_name: 'IRIS AI',
        lang: 'en',
        dir: 'ltr',
        description: 'Voice-first autonomous AI operating layer running seamlessly across browser, desktop, and background execution.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        start_url: '/?source=pwa',
        scope: '/',
        orientation: 'portrait-primary',
        prefer_related_applications: false,
        categories: ['productivity', 'utilities', 'communication'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6000000,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    }),
    {
      name: 'iris-server-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            const { handleApiRequest } = await import('./src/server/api')
            await handleApiRequest(req, res, next)
          } catch (err) {
            console.error('[Vite Server Middleware] Error handling API request:', err)
            next(err)
          }
        })

        if (server.httpServer) {
          import('./src/server/services/gemini-live')
            .then(({ attachGeminiLiveWebSocket }) => {
              attachGeminiLiveWebSocket(server.httpServer!)
            })
            .catch((err) => {
              console.error('[Vite Server] Failed to attach Gemini Live WebSocket:', err)
            })
        }
      }
    }
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom')
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  },
  build: {
    outDir: 'dist'
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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

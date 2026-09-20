import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { handleApiRequest } from './src/server/api'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'iris-server-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          handleApiRequest(req, res, next)
        })
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


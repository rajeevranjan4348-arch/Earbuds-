import { defineConfig } from 'vite'

/**
 * Bundles the Node-side IRIS server (API + static host) into `dist-server/`.
 *
 * Source files are bundled; every runtime dependency declared in
 * `package.json` stays external so it is loaded from `node_modules` at runtime.
 */
export default defineConfig({
  // The Node bundle needs no public assets — the front-end build owns those.
  publicDir: false,
  build: {
    ssr: 'src/server/standalone.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node20',
    sourcemap: false,
    minify: false,
    rollupOptions: {
      output: {
        format: 'esm',
        entryFileNames: 'server.mjs'
      }
    }
  },
  ssr: {
    target: 'node'
  }
})

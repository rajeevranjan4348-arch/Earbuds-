/**
 * IRIS Standalone Server Entry
 *
 * Production entry point for the web build:
 *
 *   npm run build        → dist/            (front-end bundle)
 *   npm run build:server → dist-server/     (this file, bundled for Node)
 *   npm start            → serves dist/ + /api on one port
 */

import { resolve } from 'node:path'

import { startIrisServer } from './http'

const DIST_DIR = process.env.IRIS_DIST_DIR
  ? resolve(process.env.IRIS_DIST_DIR)
  : resolve(process.cwd(), 'dist')

async function main(): Promise<void> {
  const { port, host, url } = await startIrisServer({
    root: DIST_DIR,
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '0.0.0.0'
  })

  console.log('\n  IRIS NEURAL OPERATING LAYER')
  console.log('  ──────────────────────────────────────────────')
  console.log(`  Front-end : ${DIST_DIR}`)
  console.log(`  Server    : ${url}  (bound ${host}:${port})`)
  console.log(`  Health    : ${url}/api/health`)
  console.log('  ──────────────────────────────────────────────\n')
}

main().catch((error) => {
  console.error('[IRIS] Failed to start server:', error)
  process.exit(1)
})

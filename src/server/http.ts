/**
 * IRIS HTTP Layer
 *
 * A single, dependency-free Node HTTP server used by every runtime flavour of
 * IRIS:
 *
 *  - `npm run dev`      → Vite dev server (middleware mounts the API handler)
 *  - `npm run start`    → production web app (`dist/` + API)
 *  - packaged Electron  → main process boots this server and loads the
 *                         renderer from it, so `/api/*` calls keep working
 *                         identically on desktop.
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

import { handleApiRequest } from './api'
import { loadEnv } from './env'
import { applyRuntimeKeys, getRuntimeKeyStatus, hydrateRuntimeKeys } from './keyStore'

loadEnv()
hydrateRuntimeKeys()

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
}

export interface IrisServerOptions {
  /** Folder containing the built front-end (index.html + assets). */
  root: string
  /** Bind host. Defaults to `process.env.HOST` or 0.0.0.0. */
  host?: string
  /**
   * Bind port. `0` picks a free port (used by the Electron host, which asks
   * the OS for the port after `listen()`).
   */
  port?: number
  /** Served over a trusted loopback origin (Electron) → allow any Host header. */
  trustAnyHost?: boolean
}

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolvePromise) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 25 * 1024 * 1024) {
        resolvePromise({})
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      if (!raw) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(raw))
      } catch (_error) {
        resolvePromise({})
      }
    })
    req.on('error', () => resolvePromise({}))
  })
}

/** Resolves a request path to a file inside `root`, blocking path traversal. */
function safeResolve(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0])
  const relative = normalize(decoded).replace(/^([/\\])+/, '')
  const target = resolve(root, relative)
  if (target !== root && !target.startsWith(root + sep)) return null
  return target
}

function streamFile(res: ServerResponse, filePath: string): void {
  const stat = statSync(filePath)
  const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  })
  createReadStream(filePath).pipe(res)
}

/**
 * Creates (but does not start) the IRIS HTTP server.
 */
export function createIrisServer(options: IrisServerOptions): Server {
  const root = resolve(options.root)
  const trustAnyHost = options.trustAnyHost ?? false

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '/'

    try {
      // ---- Runtime configuration (never returns key material) ----
      if (url.startsWith('/api/keys')) {
        if (req.method === 'POST') {
          const body = await readBody(req)
          applyRuntimeKeys(body || {})
          return sendJson(res, 200, { success: true, configured: getRuntimeKeyStatus() })
        }
        return sendJson(res, 200, { success: true, configured: getRuntimeKeyStatus() })
      }

      // ---- Backend API (agents, memory, search, YouTube, RAG, ...) ----
      if (url.startsWith('/api/')) {
        let passedThrough = false
        await handleApiRequest(req, res, () => {
          passedThrough = true
        })
        if (!passedThrough) return
        if (!res.writableEnded) {
          sendJson(res, 404, { success: false, error: `Unknown API route: ${url.split('?')[0]}` })
        }
        return
      }

      // ---- Static front-end ----
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendJson(res, 405, { error: 'Method not allowed' })
      }

      if (!existsSync(root)) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end(
          'IRIS front-end build not found. Run `npm run build` before starting the server.'
        )
      }

      let filePath = safeResolve(root, url === '/' ? '/index.html' : url)
      if (filePath && existsSync(filePath) && statSync(filePath).isDirectory()) {
        filePath = join(filePath, 'index.html')
      }
      if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        // SPA fallback — unknown routes render the app shell.
        filePath = join(root, 'index.html')
      }
      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('Not found')
      }

      if (req.method === 'HEAD') {
        const stat = statSync(filePath)
        res.writeHead(200, { 'Content-Length': stat.size })
        return res.end()
      }

      return streamFile(res, filePath)
    } catch (error: any) {
      console.error('[IRIS Server] Request failed:', error)
      if (!res.writableEnded) {
        sendJson(res, 500, { success: false, error: error?.message || 'Internal server error' })
      }
    }
  })

  // Long lived agent streams can exceed Node's default header timeout.
  server.keepAliveTimeout = 65_000
  server.headersTimeout = 70_000

  return server
}

export interface StartedServer {
  server: Server
  port: number
  host: string
  url: string
}

export function startIrisServer(options: IrisServerOptions): Promise<StartedServer> {
  const host = options.host || process.env.HOST || '0.0.0.0'
  const port = Number(options.port ?? process.env.PORT ?? 3000)
  const server = createIrisServer({ ...options, host, port })

  return new Promise((resolvePromise, reject) => {
    server.on('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      const boundPort = typeof address === 'object' && address ? address.port : port
      const boundHost = typeof address === 'object' && address ? address.address : host
      resolvePromise({
        server,
        port: boundPort,
        host: boundHost,
        url: `http://${boundHost === '::' ? '127.0.0.1' : boundHost}:${boundPort}`
      })
    })
  })
}

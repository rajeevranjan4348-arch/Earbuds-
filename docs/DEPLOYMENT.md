# 📦 Deployment

IRIS ships in two shapes from the same source tree:

1. **Web** — a static bundle plus a single Node process that serves the UI _and_
   the backend API (agents, memory, search, RAG, YouTube, workspace…).
2. **Desktop** — an Electron shell that boots that same Node server internally
   and loads the renderer from it, so every `/api/*` call behaves identically.

## Quick reference

| Command                  | Output                   | Purpose                                  |
| ------------------------ | ------------------------ | ---------------------------------------- |
| `npm run build`          | `dist/`                  | Client bundle (React + Tailwind + R3F)   |
| `npm run build:server`   | `dist-server/server.mjs` | Node HTTP server (ESM, deps external)    |
| `npm start`              | –                        | Serves `dist/` + `/api` on `PORT` (3000) |
| `npm run serve`          | –                        | `build` + `build:server` + `start`       |
| `npm run build:electron` | `out/`                   | Electron main / preload / renderer       |
| `npm run dist:win`       | `dist/` installers       | Windows NSIS installer                   |
| `npm run dist:mac`       | `dist/` installers       | macOS DMG                                |
| `npm run dist:linux`     | `dist/` installers       | AppImage / deb / snap                    |
| `npm run build:all`      | all of the above         | CI convenience target                    |

## Web deployment

```bash
npm ci
npm run build
npm run build:server
PORT=8080 HOST=0.0.0.0 npm start
```

Configuration:

- `PORT` — HTTP port (default `3000`)
- `HOST` — bind address (default `0.0.0.0`)
- `IRIS_DIST_DIR` — override the static root (default `<cwd>/dist`)
- `.env` / `.env.local` — secrets loaded into `process.env` at boot

Health check: `GET /api/health`.
Runtime key status (booleans only, never key material): `GET /api/keys`.

Behind nginx / a reverse proxy, forward the whole path space — the API lives on
the same origin as the UI:

```nginx
location / {
  proxy_pass         http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header   Upgrade $http_upgrade;
  proxy_set_header   Connection "upgrade";
  proxy_read_timeout 300s;
}
```

## Desktop packaging

`electron-builder.yml` handles ASAR packaging, integrity validation and V8
bytecode compilation of the main/preload bundles.

```bash
npm run dist:linux   # AppImage, deb, snap
```

The packaged app starts an embedded backend on a random loopback port and points
`BrowserWindow` at it, so:

- `/api/*` calls resolve without CORS or file-protocol workarounds
- `localStorage`, microphone and camera work on a secure (`127.0.0.1`) origin
- API keys stay in the OS keychain, injected into the backend on boot

To bundle `adb` with the desktop build, drop the platform-tools into
`resources/platform-tools/` (or set `IRIS_ADB_PATH`); otherwise the Phone panel
falls back to the paired-device / disconnected states.

## Checklist before release

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build && npm run build:server && npm start` → smoke test `/api/health`
- [ ] `npm run dist:<platform>` on the target OS

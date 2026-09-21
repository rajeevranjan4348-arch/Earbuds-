# 🚀 Getting Started

IRIS is a powerful voice-first AI OS. This guide walks through a full local
setup — browser **and** desktop — using the code in this repository.

## 1. Prerequisites

- Node.js v20+ (v22 LTS recommended)
- Windows 10/11, macOS, or Linux
- API keys for the engines you want to use (Gemini is the default brain)

> Electron binaries download automatically on `npm install`. Behind a proxy set
> `ELECTRON_SKIP_BINARY_DOWNLOAD=1` if you only want to run the web app.

## 2. Installation

```bash
git clone <your-fork-url>
cd IRIS-AI
npm install
```

## 3. Configuration

Copy `.env.example` to `.env` and fill in the providers you have:

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY=...        # Gemini chat / vision / embeddings
GROQ_API_KEY=...          # Ultra-low-latency responses
TAVILY_API_KEY=...        # Real-time web search
MEM0_API_KEY=...          # Long-term memory (optional, local fallback exists)
SQL_HOST=...              # Optional Cloud SQL (map waypoints, workspace items)
SQL_DB_NAME=...
```

Both runtimes (Vite dev server and the standalone server) load `.env`
automatically, and keys are **never** exposed to the browser bundle.

Keys can also be entered at runtime in **Settings → API Keys**:

| Runtime  | Storage                                                  |
| -------- | -------------------------------------------------------- |
| Electron | `safeStorage` (Keychain / DPAPI / libsecret) vault       |
| Web      | `.iris-keys.json` (chmod `600`), mirrored to the backend |

## 4. Run

### Browser (web app)

```bash
npm run dev      # Vite on http://localhost:3000 (API mounted on /api/*)
```

### Desktop (Electron)

```bash
npm run dev:electron
```

The desktop build exposes everything the web shim only simulates:

| Capability          | Web (shim)             | Electron (native)                        |
| ------------------- | ---------------------- | ---------------------------------------- |
| Notes / gallery     | `localStorage`         | JSON + media files in `userData`         |
| Media URLs          | remote sample images   | `iris-media://gallery/<file>` protocol   |
| App launch / close  | simulated              | real process launch per platform         |
| System telemetry    | simulated values       | live CPU / RAM / thermals / drives       |
| ADB (Phone panel)   | simulated device       | real `adb` bridge (Wi-Fi pairing)        |
| Accessibilty bridge | simulated              | `adb shell input …` dispatch             |
| API keys            | `.iris-keys.json`      | OS keychain vault                        |

## 5. Production

```bash
npm run build         # dist/
npm run build:server  # dist-server/server.mjs
npm start             # one process: static UI + /api on :3000
```

Desktop installers: `npm run dist:win` / `dist:mac` / `dist:linux`. See
[DEPLOYMENT.md](DEPLOYMENT.md).

## 6. Verify

```bash
curl http://localhost:3000/api/health
# {"status":"ok","geminiConnected":true, ...}
```

## 7. Notes on tiers

Sponsorship tiers are documented in
[SPONSORSHIP_GUIDE.md](SPONSORSHIP_GUIDE.md). The code in this repository runs
end-to-end; sponsorship unlocks additional documentation and support.

# Install

For the end-to-end local API, extension, and TradingView workflow, see [User setup](user-setup.md). If you are not sure which path you need, start with [Getting started](getting-started.md).

RS Levels is in early development. The current developer flow works on Windows, macOS, and Linux with Node.js 20 or newer.

## Clone

```powershell
git clone git@github.com:anaremore/rs-levels.git
cd rs-levels
```

## Run Tests

```powershell
npm test
npm run scan:private
npm run scan:secrets
```

`npm test` includes `npm run package:check`, which verifies the release package includes the local API, browser extension, TradingView indicator, display plugins, docs, scan tooling, and standalone extension packaging inputs.

## Start The Local Service

```powershell
npm start
```

Check CLI usage without starting the service:

```powershell
node apps/local-service/src/cli.js --help
```

Release packages also include launch wrappers:

```text
scripts/start-local-service.cmd
scripts/start-local-service.ps1
scripts/start-local-service.sh
```

Default URL:

```text
http://127.0.0.1:8765
```

Check health:

```powershell
curl http://127.0.0.1:8765/health
```

Open local API docs at `http://127.0.0.1:8765/docs`. The OpenAPI/Swagger-compatible spec is served at `http://127.0.0.1:8765/openapi.yaml` and checked into `docs/openapi.yaml`.

## Trusted Private Network Use

Loopback is the default. For Tailscale or another trusted private network, intentionally opt in:

```powershell
$env:RS_LEVELS_HOST = "0.0.0.0"
$env:RS_LEVELS_ALLOW_REMOTE = "1"
npm start
```

On macOS/Linux:

```bash
RS_LEVELS_HOST=0.0.0.0 RS_LEVELS_ALLOW_REMOTE=1 npm start
```

Only use remote binding on networks you trust. The browser extension should continue to default to localhost unless the user explicitly changes the service URL.

## Browser Extension

The extension supports Chrome/Chromium and Firefox Desktop 140+. Firefox for Android is not currently supported. The extension posts allowlisted RocketScooter responses to `/capture/api`, shows local service status, and provides opt-in `Send to TradingView` plus an explicit payload-copy fallback.

`npm run package` creates two focused artifacts:

```text
dist/rs-levels-browser-extension-<extension-version>.zip
dist/rs-levels-browser-extension-firefox-<extension-version>.zip
```

For Chrome/Chromium, unzip the first artifact and choose `Load unpacked` from `chrome://extensions`. For a temporary Firefox install, open `about:debugging`, choose `This Firefox` and `Load Temporary Add-on`, then select the Firefox ZIP or its extracted root `manifest.json`. Firefox removes temporary add-ons on restart; permanent distribution requires Mozilla signing.

## Platform Plugins

Plugins are display-only and will consume the read-only API. TradingView is handled differently because Pine scripts cannot call arbitrary localhost HTTP; see [TradingView](tradingview.md).

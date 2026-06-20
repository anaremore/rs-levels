# Local Service

Cross-platform localhost API service for RS Levels.

The service receives browser-extension captures, normalizes display levels, keeps the latest snapshot in memory, and exposes read-only REST plus Server-Sent Events feeds for charting tools.

## Start

```powershell
npm start
```

Built-in docs: http://127.0.0.1:8765/docs.

OpenAPI spec: http://127.0.0.1:8765/openapi.yaml, also checked in at docs/openapi.yaml.

CLI smoke checks:

```powershell
node apps/local-service/src/cli.js --help
node apps/local-service/src/cli.js --version
```

Default URL:

```text
http://127.0.0.1:8765
```

The service is plain Node.js and is intended to run on Windows, macOS, and Linux.

## Configuration

```text
RS_LEVELS_HOST=127.0.0.1
RS_LEVELS_PORT=8765
RS_LEVELS_ALLOW_REMOTE=0
RS_LEVELS_CORS_ORIGINS=
RS_LEVELS_STALE_MS=82800000
```

Loopback is the safe default. To expose the API to another machine on Tailscale or another trusted private network, set both an explicit non-loopback host and the remote-access flag:

```powershell
$env:RS_LEVELS_HOST = "0.0.0.0"
$env:RS_LEVELS_ALLOW_REMOTE = "1"
npm start
```

If a non-loopback host is requested without `RS_LEVELS_ALLOW_REMOTE=1`, the service falls back to `127.0.0.1` and reports a warning in `/health`.

## Endpoints

```text
GET  /
GET  /docs
GET  /openapi.yaml
GET  /swagger.yaml
GET  /diagnostics
GET  /health
GET  /status
GET  /plugins
GET  /snapshot
GET  /levels
GET  /levels/:symbol
GET  /levels/:symbol?format=sierra
GET  /ddbands
GET  /zones
GET  /references
GET  /tradingview
GET  /tradingview?format=json
GET  /tradingview/:symbol
GET  /tradingview/:symbol?format=json
GET  /stream
POST /capture/api
```

/tradingview returns the compact all-symbol text payload used by the TradingView Pine indicator. /tradingview/:symbol remains available for single-symbol compatibility. ?format=json returns a copy-friendly JSON export for tooling.

/status includes scrubbed per-symbol summaries so clients can confirm a selected symbol has captured levels before requesting an export.

/plugins returns the public display-plugin manifest from `plugins/manifest.json`.

/docs is a lightweight local API docs page. /openapi.yaml serves the OpenAPI 3.1 spec for Swagger UI, Redoc, Postman, Insomnia, and compatible clients.

/diagnostics returns scrubbed setup checks and hints for local API, capture, and private-network troubleshooting. It does not include raw captured URLs.

/health, /status, /snapshot, and /diagnostics compute service-side source freshness on each read. After `RS_LEVELS_STALE_MS`, the source state becomes `stale` and `connected` becomes `false`. The default is 23 hours because RocketScooter levels are expected to remain stable after the daily post-open update window.

/stream is an SSE stream that emits the current snapshot immediately and emits a new snapshot after each accepted capture.

`POST /capture/api` is for the browser extension. Display clients should use the read-only endpoints.

## Safety Boundary

This service does not include trading strategy, broker connectivity, order entry, cancel, flatten, account balances, positions, PnL, or journals.

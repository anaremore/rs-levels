# Local Service

Cross-platform localhost API service for RS Levels.

The service receives browser-extension captures, normalizes display levels, keeps the latest snapshot in memory, and exposes read-only REST plus Server-Sent Events feeds for charting tools.

## Start

```powershell
npm start
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
GET  /health
GET  /status
GET  /snapshot
GET  /levels
GET  /levels/:symbol
GET  /levels/:symbol?format=sierra
GET  /ddbands
GET  /references
GET  /stream
POST /capture/api
```

`/stream` is an SSE stream that emits the current snapshot immediately and emits a new snapshot after each accepted capture.

`POST /capture/api` is for the browser extension. Display clients should use the read-only endpoints.

## Safety Boundary

This service does not include trading strategy, broker connectivity, order entry, cancel, flatten, account balances, positions, PnL, or journals.
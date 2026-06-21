# RS Levels

Local-first RocketScooter level and display-context capture feeds.

RS Levels lets a user capture level and display-context data from their own RocketScooter browser session, normalize it locally, and expose it through localhost APIs for display tools and charting-platform plugins.

## What This Is

- A browser extension for allowlisted RocketScooter response capture.
- A cross-platform local API service that stores the latest level snapshot and display stats.
- Stable JSON, text, and streaming APIs for display integrations.
- Display-only plugins for charting platforms.

## What This Is Not

- No trading strategy.
- No trade recommendations.
- No order entry, cancel, flatten, or broker execution.
- No account, PnL, batch, or trade-journal features.
- No redistribution of RocketScooter data.

Users must have their own RocketScooter access. This project only processes data already loaded in the user's browser and keeps it local by default.

## Quick Start

```powershell
npm test
npm start
```

Post public-safe demo levels after starting the service:

```powershell
npm run demo:capture
```

Create a release directory:

```powershell
npm run package
```

The release output includes a source-style directory, a source zip archive, a standalone browser-extension zip, `RELEASE-MANIFEST.json`, `SHA256SUMS.txt`, and checksum sidecars.

Packaged users can start the local API with `npm start` or the wrappers in `scripts/start-local-service.*`.

See [User setup](docs/user-setup.md) for the local API, browser extension, and TradingView workflow.

OpenAPI spec: [docs/openapi.yaml](docs/openapi.yaml), also served at `http://127.0.0.1:8765/openapi.yaml` after startup. Local API docs: `http://127.0.0.1:8765/docs`.

Examples: `examples/html-dashboard`, `examples/node-client`, and `examples/python-client`.

Default service URL:

```text
http://127.0.0.1:8765
```

## Layout

```text
apps/
  browser-extension/
  local-service/
packages/
  schemas/
  core-parser/
plugins/
  manifest.json
  sierra-chart/
  ninjatrader/
  quantower/
  bookmap/
  tradingview/
examples/
  html-dashboard/
  node-client/
  python-client/
docs/
scripts/
```

## Status

Public-safe foundation in progress. The schema package, parser, exporter package, local service shell, TradingView paste workflow, browser extension shell, and initial display plugin sources are implemented with tests.

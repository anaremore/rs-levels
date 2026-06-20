# API

Default base URL:

```text
http://127.0.0.1:8765
```

The local service is read-mostly. The only write endpoint is browser-capture ingest.

The browser extension can send either captured RocketScooter API responses or its display-only page-reader fallback to `POST /capture/api`. Page-reader captures use the scrubbed endpoint key `/page-reader/display` and contain only display levels read from visible futures chart objects.

HTTP responses include `Cache-Control: no-store` so browser tools, dashboards, and chart plugins should always receive the latest local snapshot instead of a cached level export.

A machine-readable OpenAPI 3.1 spec is checked in at [openapi.yaml](openapi.yaml) and served by the running API at `http://127.0.0.1:8765/openapi.yaml`. A lightweight local docs page is available at `http://127.0.0.1:8765/docs`.

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

WebSockets are not implemented yet. `GET /stream` is the first streaming transport because Server-Sent Events are easy for browsers, dashboards, and local tools.

## GET /

Returns service metadata and endpoint hints.

```json
{
  "ok": true,
  "name": "RS Levels local service",
  "version": "0.0.0",
  "build": {
    "revision": "",
    "generatedAt": "",
    "source": "source"
  },
  "endpoints": ["/docs", "/openapi.yaml", "/diagnostics", "/health", "/status", "/plugins", "/snapshot", "/levels", "/zones", "/tradingview", "/tradingview/:symbol", "/stream"],
  "network": {}
}
```

## GET /docs

Returns a lightweight local HTML page with links to the OpenAPI spec and common read endpoints.

## GET /openapi.yaml

Returns the OpenAPI 3.1 YAML spec. Use this URL with Swagger UI, Redoc, Postman, Insomnia, or other OpenAPI-compatible tools.

`/swagger.yaml` is an alias for tools that look for Swagger-named specs.

## GET /diagnostics

Returns a scrubbed setup and support bundle for local API and browser-extension troubleshooting. It includes network posture, source state, symbol count, level count, setup checks, and hints.

Public source endpoint summaries intentionally omit raw captured URLs. Endpoint diagnostics include the normalized endpoint key, status, parser name, timestamp, and parse result only.

`source.ageMs` is calculated when diagnostics are requested. It measures how long it has been since the local service accepted the latest capture. Once it exceeds the local service stale threshold, `source.state` becomes `stale` and `source.connected` becomes `false`. The default threshold is 23 hours because RocketScooter levels are expected to remain stable after the daily post-open update window.

```json
{
  "ok": true,
  "service": "rs-levels",
  "version": "0.0.0",
  "build": {
    "revision": "",
    "generatedAt": "",
    "source": "source"
  },
  "docs": {
    "local": "/docs",
    "openApi": "/openapi.yaml",
    "swagger": "/swagger.yaml"
  },
  "source": {
    "state": "waiting",
    "connected": false,
    "lastCaptureAt": "",
    "ageMs": null,
    "endpointCount": 0,
    "endpoints": []
  },
  "symbols": [],
  "levelCount": 0,
  "checks": [
    { "id": "service", "label": "Local API", "status": "ok", "detail": "HTTP API is responding." }
  ],
  "hints": []
}
```

## GET /health

Health includes network posture, source state, symbol count, and level count. Source freshness is computed on each read, so `ageMs`, `state`, and `connected` reflect current service-side freshness instead of the ingest-time snapshot only.

```json
{
  "ok": true,
  "service": "rs-levels",
  "version": "0.0.0",
  "build": {
    "revision": "",
    "generatedAt": "",
    "source": "source"
  },
  "schemaVersion": "0.1.0",
  "generatedAt": "2026-06-19T14:30:00.000Z",
  "network": {
    "host": "127.0.0.1",
    "requestedHost": "127.0.0.1",
    "port": 8765,
    "remoteAccess": false,
    "corsOrigins": [
      "http://127.0.0.1",
      "http://127.0.0.1:*",
      "http://localhost",
      "http://localhost:*",
      "http://[::1]:*",
      "null",
      "chrome-extension://*",
      "moz-extension://*"
    ],
    "warnings": []
  },
  "source": {
    "state": "waiting",
    "connected": false,
    "lastCaptureAt": "",
    "ageMs": null,
    "warnings": []
  },
  "symbolCount": 0,
  "levelCount": 0
}
```

## GET /status

Returns a compact status payload for UI badges and plugin diagnostics. Display plugins should use `source.state`, `source.connected`, and `source.ageMs` to avoid making stale captures look live.

```json
{
  "ok": true,
  "version": "0.0.0",
  "build": {
    "revision": "",
    "generatedAt": "",
    "source": "source"
  },
  "network": {},
  "source": {},
  "symbolCount": 1,
  "levelCount": 6,
  "symbols": ["MES"],
  "symbolSummaries": [
    {
      "symbol": "MES",
      "displaySymbol": "MES",
      "levelCount": 6,
      "capturedAt": "2026-06-19T14:29:59.500Z",
      "warnings": []
    }
  ]
}
```

`symbolSummaries` is scrubbed and safe for display plugins. It lets UI clients verify that a selected symbol has captured levels before requesting `/levels/:symbol` or `/tradingview/:symbol`.

`build.source` is `source` for local source checkouts and `package` for generated release packages. Packaged builds include a short git `build.revision`.

## GET /plugins

Returns the public display-plugin manifest from `plugins/manifest.json` with a response timestamp. The manifest lists included adapter entry files, README paths, platform names, integration modes, and read-only local API endpoints.

```json
{
  "schemaVersion": "0.1.0",
  "generatedAt": "2026-06-19T14:30:00.000Z",
  "plugins": []
}
```

## GET /snapshot

Returns the full versioned snapshot. See [schema reference](schema-reference.md).

## GET /levels

Returns all known levels as a flat array.

```json
{
  "levels": []
}
```

## GET /levels/:symbol

Returns one normalized symbol snapshot. Aliases are normalized through the public schema package, so `ES` maps to `MES` and `NQ` maps to `MNQ`. Current-contract CQG-style RocketScooter symbols are normalized into the same families: `F.US.EP...` and `EP...` map to `MES`, while `F.US.ENQ...` and `ENQ...` map to `MNQ`.

Unknown symbols return `404`:

```json
{
  "ok": false,
  "error": "symbol not found"
}
```

## GET /levels/:symbol?format=sierra

Returns a simple Sierra-compatible CSV-like text feed:

```text
OVNHP,7537.00,41,98,255
DD Upper,7579.75,41,182,246
```

Columns are `name,price,red,green,blue`. Missing symbols return an empty text body with status `200` so chart studies can poll safely before capture begins.

## GET /tradingview

Returns a compact all-symbol futures text payload for the included TradingView Pine indicator. The extension popup uses this route for `Copy TradingView` so one copied payload can contain both MES and MNQ. The Pine indicator reads the chart family and draws the matching section on ES/MES or NQ/MNQ charts. CQG current-contract symbols are normalized by root and contract suffix pattern, so rollover from `F.US.EPU26` to later `F.US.EP...` contracts and from `F.US.ENQU26` to later `F.US.ENQ...` contracts keeps exporting the same MES/MNQ families. SPY, QQQ, and other watchlist/ETF symbols are intentionally omitted.

```text
RSLEVELS|2|2026-06-19T14:30:00.000Z|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp|MNQ|2026-06-19T14:29:59.500Z|BrZT1,30450.00,zone-bear
```

Unknown or unsupported chart symbols fall back to the first symbol section. The local API includes every finite-price level in each section unless a caller explicitly requests a smaller set.

## GET /tradingview?format=json

Returns a copy-friendly JSON export with the v2 all-symbol compact payload and structured symbol rows.

```json
{
  "schemaVersion": "0.1.0",
  "exportFormat": "tradingview-bundle-json",
  "payloadVersion": 2,
  "compactPayload": "RSLEVELS|2|...",
  "symbols": []
}
```

## GET /tradingview/:symbol

Returns a compact single-symbol text payload for compatibility with older workflows and external tools. Aliases normalize the same way as `/levels/:symbol`, including CQG-style RocketScooter contracts such as `F.US.EPU26` and `F.US.ENQU26`.

```text
RSLEVELS|1|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp;DD Upper,7579.75,dd-band
```

The payload is intentionally not JSON because Pine scripts do not include a JSON parser and cannot poll localhost directly. The local API includes every finite-price level in the export unless a caller explicitly requests a smaller set. See [TradingView](tradingview.md).

## GET /tradingview/:symbol?format=json

Returns a copy-friendly JSON export for tooling and inspection:

```json
{
  "schemaVersion": "0.1.0",
  "exportFormat": "tradingview-json",
  "payloadVersion": 1,
  "symbol": "MES",
  "compactPayload": "RSLEVELS|1|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp",
  "levels": []
}
```

Pine users should paste the compact `RSLEVELS|...` payload into the indicator input. JSON clients can read `compactPayload` when they need the exact Pine-ready string alongside structured rows.

## GET /ddbands

Returns all flat levels whose kind is `dd-band`.

## GET /zones

Returns all flat levels whose kind is `zone`, `zone-bull`, or `zone-bear`.

## GET /references

Returns flat reference levels, including `reference`, `open-close`, `hp`, and `mhp` kinds.

## GET /stream

Server-Sent Events stream. The service sends the current snapshot immediately:

```text
event: snapshot
data: {"schemaVersion":"0.1.0"}
```

Each accepted capture broadcasts another `snapshot` event.

## POST /capture/api

Browser-extension ingest endpoint. Public display clients should not post here.

Accepted payload shape:

```json
{
  "endpoint": "/platform/api/v1/ddbands/MES",
  "status": 200,
  "capturedAt": "2026-06-19T14:29:59.500Z",
  "body": {
    "symbol": "MES",
    "levels": [
      { "name": "OVNHP", "price": 7537, "color": [41, 98, 255] }
    ]
  }
}
```

`body` may be an object or a JSON string. The parser walks the response and keeps display levels with a recognizable name/label and finite price/value. If one response contains both ES/MES and NQ/MNQ sections, including CQG-style keys such as `F.US.EP...` and `F.US.ENQ...`, both symbols are stored from the same capture. Bull and bear zones are represented as `zone-bull` and `zone-bear` when names, keys, or range groups distinguish the side.

## CORS

The service is origin-aware by default. It allows loopback browser tools, file-open dashboards, and browser-extension origins, but it does not return `Access-Control-Allow-Origin` for arbitrary websites.

Default allowed origins:

```text
http://127.0.0.1
http://127.0.0.1:*
http://localhost
http://localhost:*
http://[::1]:*
null
chrome-extension://*
moz-extension://*
```

Use `RS_LEVELS_CORS_ORIGINS` for explicit additional origins, separated by commas. Remote binding remains opt-in through `RS_LEVELS_ALLOW_REMOTE=1`; see [networking](networking.md).

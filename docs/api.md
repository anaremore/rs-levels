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
GET  /levels/:symbol?format=rows
GET  /stats
GET  /stats/:symbol
GET  /stats/:symbol?format=rows
GET  /ddbands
GET  /zones
GET  /references
GET  /tradingview
GET  /tradingview/:symbol
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
  "endpoints": ["/docs", "/openapi.yaml", "/diagnostics", "/health", "/status", "/plugins", "/snapshot", "/levels", "/stats", "/stats/:symbol", "/zones", "/tradingview", "/tradingview/:symbol", "/stream"],
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
  "symbols": ["ES"],
  "symbolSummaries": [
    {
      "symbol": "ES",
      "displaySymbol": "ES",
      "levelCount": 6,
      "stats": {
        "dd": 0.66,
        "resilience": 73.82,
        "weeklyResilience": -29.29,
        "monthlyResilience": 49.87,
        "mapCode": "BLD"
      },
      "capturedAt": "2026-06-19T14:29:59.500Z",
      "warnings": []
    }
  ]
}
```

`symbolSummaries` is scrubbed and safe for display plugins. User-facing status uses `ES` and `NQ` labels to avoid exposing the internal micro-contract storage aliases. It lets UI clients verify that a selected symbol has captured levels before requesting `/levels/:symbol` or `/tradingview/:symbol`.

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

Returns one user-facing symbol snapshot. Aliases resolve through the public schema package, so `ES`, `MES`, and CQG `F.US.EP...` contracts share the ES family, while `NQ`, `MNQ`, and CQG `F.US.ENQ...` contracts share the NQ family. JSON responses and TradingView payloads present those families as `ES` and `NQ`; full internal snapshots may still use canonical `MES` and `MNQ` storage keys.

Unknown symbols return `404`:

```json
{
  "ok": false,
  "error": "symbol not found"
}
```

## GET /levels/:symbol?format=rows

Returns a simple generic display row text feed:

```text
OVNHP,7537.00,41,98,255,hp
DD Upper,7579.75,41,182,246,dd-band
```

Columns are `name,price,red,green,blue,kind`. Display clients should read `kind` to distinguish `zone-bull`, `zone-bear`, `yellow-line`, `red-line`, `cat`, and other display categories for fills and settings. Missing symbols return a blank-line text body with status `200` so chart studies can poll safely before capture begins and Sierra Chart ACSIL clients can observe HTTP completion.

## GET /stats

Returns display context stats for every symbol with captured stats:

```json
{
  "symbols": [
    {
      "symbol": "ES",
      "displaySymbol": "ES",
      "capturedAt": "2026-06-19T14:29:59.500Z",
      "stats": {
        "dd": 0.66,
        "resilience": 73.82,
        "weeklyResilience": -29.29,
        "monthlyResilience": 49.87,
        "mapCode": "BLD"
      }
    }
  ]
}
```

Stats are display-only RocketScooter context. `mapCode` is the liquidity-map code as exposed by RocketScooter, for example `BLD`.

## GET /stats/:symbol?format=rows

Returns simple display-context rows for direct plugins:

```text
DD,0.66
Res,73.82
MRes,49.87
WRes,-29.29
Map,BLD
```

Aliases resolve the same way as `/levels/:symbol`. Missing stats return a blank-line text body with status `200` for row format so ACSIL clients do not stall on a completed empty response.

## GET /tradingview

Returns the all-symbol futures `RSLEVELS|2` paste payload for the included TradingView Pine indicator. The extension popup copies this endpoint for `ES + NQ`. In `Auto`, the Pine indicator detects ES/MES or NQ/MNQ from TradingView's chart symbol metadata and draws the matching section. CQG current-contract symbols are normalized by root and contract suffix pattern, so rollover from `F.US.EPU26` to later `F.US.EP...` contracts and from `F.US.ENQU26` to later `F.US.ENQ...` contracts keeps exporting the same ES/NQ families. SPY, QQQ, and other watchlist/ETF symbols are intentionally omitted.

```text
RSLEVELS|2|2026-06-19T14:30:00.000Z|ES|2026-06-19T14:29:59.500Z|OVNHP,7537,hp;BZT1,7588,zone-bull;DD,0.66,stat;Map BLD,0,stat|NQ|2026-06-19T14:29:59.500Z|BrZT1,30450,zone-bear;Res,73.82,stat;MRes,49.87,stat;WRes,-29.29,stat
```

The local API includes every finite-price level in each section unless a caller explicitly requests a smaller set. User-added RocketScooter yellow, red, and purple CAT chart lines are exported as `yellow-line`, `red-line`, and `cat` kinds when they are captured. Display context travels as `stat` rows; the included Pine indicator uses those rows for its stats panel and does not draw them as price levels.

## GET /tradingview/:symbol

Returns a single-symbol `RSLEVELS|2` paste payload. Aliases normalize the same way as `/levels/:symbol`, including CQG-style RocketScooter contracts such as `F.US.EPU26` and `F.US.ENQU26`.

```text
RSLEVELS|2|2026-06-19T14:30:00.000Z|ES|2026-06-19T14:29:59.500Z|OVNHP,7537,hp;DD Upper,7579.75,dd-band
```

The included Pine indicator accepts this payload directly. The local API includes every finite-price level in the export unless a caller explicitly requests a smaller set. See [TradingView](tradingview.md).

## GET /ddbands

Returns all flat levels whose kind is `dd-band`.

## GET /zones

Returns all flat levels whose kind is `zone`, `zone-bull`, or `zone-bear`.

## GET /references

Returns flat reference levels, including `reference`, `open-close`, `hp`, `mhp`, `yellow-line`, `red-line`, and `cat` kinds.

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

The page-reader fallback may also post a display snapshot with top-level `chartLines`, `referenceLines`, `zoneRectangles`, and `stats` data. These are normalized by futures chart family (`index: "ES"` becomes `MES`, `index: "NQ"` becomes `MNQ`) so one live RocketScooter page can populate both ES/MES and NQ/MNQ exports. User-added yellow, red, and purple CAT chart lines are captured from visible futures chart objects when they expose a finite price. Header/study/scanner context such as DD, Res, MRes, WRes, and liquidity-map `Map` codes is stored as stats, not price levels. Non-futures panels such as SPY, QQQ, or watchlist quotes are ignored unless they are merely text labels on a recognized futures chart line or the source of display-only map context.

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

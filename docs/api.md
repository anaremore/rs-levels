# API

Default base URL:

```text
http://127.0.0.1:8765
```

The local service is read-mostly. The only write endpoint is browser-capture ingest.

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

WebSockets are not implemented yet. `GET /stream` is the first streaming transport because Server-Sent Events are easy for browsers, dashboards, and local tools.

## GET /

Returns service metadata and endpoint hints.

```json
{
  "ok": true,
  "name": "RS Levels local service",
  "endpoints": ["/health", "/status", "/snapshot", "/levels", "/stream"],
  "network": {}
}
```

## GET /health

Health includes network posture, source state, symbol count, and level count.

```json
{
  "ok": true,
  "service": "rs-levels",
  "schemaVersion": "0.1.0",
  "generatedAt": "2026-06-19T14:30:00.000Z",
  "network": {
    "host": "127.0.0.1",
    "requestedHost": "127.0.0.1",
    "port": 8765,
    "remoteAccess": false,
    "warnings": []
  },
  "source": {
    "state": "waiting",
    "connected": false,
    "warnings": []
  },
  "symbolCount": 0,
  "levelCount": 0
}
```

## GET /status

Returns a compact status payload for UI badges and plugin diagnostics.

```json
{
  "ok": true,
  "network": {},
  "source": {},
  "symbols": ["MES", "MNQ"]
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

Returns one normalized symbol snapshot. Aliases are normalized through the public schema package, so `ES` maps to `MES` and `NQ` maps to `MNQ`.

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

## GET /ddbands

Returns all flat levels whose kind is `dd-band`.

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

`body` may be an object or a JSON string. The parser walks the response and keeps display levels with a recognizable name/label and finite price/value.

## CORS

The service currently allows local browser tooling with:

```text
Access-Control-Allow-Origin: *
```

Remote binding remains opt-in through `RS_LEVELS_ALLOW_REMOTE=1`; see [networking](networking.md).
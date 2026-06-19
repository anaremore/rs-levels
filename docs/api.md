# API Draft

Default local service base URL:

```text
http://127.0.0.1:8765
```

The port is intentionally different from private trading tools so RS Levels can run without colliding with them.

## Endpoints

```text
GET  /health
GET  /status
GET  /snapshot
GET  /levels
GET  /levels/:symbol
GET  /ddbands
GET  /references
GET  /stream
WS   /ws
POST /capture/api
```

`POST /capture/api` is the browser-extension ingest endpoint. Public display clients should use read-only endpoints.

## Response Envelope

All JSON responses should include a schema version and timestamp:

```json
{
  "schemaVersion": "0.1.0",
  "generatedAt": "2026-06-19T14:30:00.000Z",
  "data": {}
}
```

## Snapshot Draft

```json
{
  "schemaVersion": "0.1.0",
  "capturedAt": "2026-06-19T14:30:00.000Z",
  "symbols": {
    "MES": {
      "levels": []
    },
    "MNQ": {
      "levels": []
    }
  }
}
```

## Streaming

`GET /stream` should be Server-Sent Events for simple clients. `WS /ws` should provide the same snapshot-update messages for clients that prefer WebSockets.


# Schema Reference

The public schema is display-first. It describes visible levels and source freshness, not trading advice.

Current schema version: `0.1.0`.

## Snapshot Envelope

```json
{
  "schemaVersion": "0.1.0",
  "generatedAt": "2026-06-19T14:30:00.000Z",
  "capturedAt": "2026-06-19T14:29:59.500Z",
  "source": {},
  "symbols": {},
  "warnings": []
}
```

## Source State

`source.state` is one of:

- `offline`
- `waiting`
- `capturing`
- `stale`
- `error`

Use `source.endpoints` to show which RocketScooter captures were seen recently and whether parsing succeeded.

## Symbol Snapshot

Each symbol key maps to a display snapshot:

```json
{
  "symbol": "MES",
  "displaySymbol": "ES/MES",
  "price": 7610.25,
  "capturedAt": "2026-06-19T14:29:59.500Z",
  "levels": [],
  "stats": {},
  "warnings": []
}
```

## Level

```json
{
  "id": "MES:DD-UPPER:7579.75",
  "symbol": "MES",
  "name": "DD Upper",
  "price": 7579.75,
  "kind": "dd-band",
  "color": "#29B6F6",
  "source": "rocketscooter",
  "capturedAt": "2026-06-19T14:29:59.500Z",
  "metadata": {}
}
```

`kind` is one of:

- `hp`
- `mhp`
- `zone`
- `dd-band`
- `reference`
- `open-close`
- `stat`
- `unknown`

## Diagnostics

`GET /diagnostics` returns a scrubbed setup bundle for local support and extension troubleshooting. It includes network posture, source state, setup checks, hints, symbol names, and level counts.

Captured source endpoint summaries omit raw URLs. They include only normalized endpoint keys, status codes, parser names, timestamps, and parse status.

## Samples And Validation

Sample payloads live in `packages/schemas/examples/`.

Run:

```powershell
node packages/schemas/test/validate-samples.test.js
```


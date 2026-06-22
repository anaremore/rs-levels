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

`source.lastCaptureAt` preserves the capture timestamp. `source.ageMs` is calculated by the local service when a snapshot, health payload, status payload, or diagnostics bundle is read and measures how long it has been since the service accepted the latest capture. After the configured stale threshold is exceeded, the local service reports `source.state: "stale"` and `source.connected: false`. The default stale threshold is 23 hours because captured RocketScooter levels are expected to remain useful after the daily post-open update window.

Use `source.endpoints` to show which RocketScooter captures were seen recently and whether parsing succeeded. Endpoint summaries intentionally omit raw captured URLs and include only normalized endpoint keys, status codes, parser names, timestamps, and parse status. Long numeric or identifier-like path segments in endpoint keys are scrubbed as `:id`.

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

Symbols are normalized to display families for cross-platform chart use. `ES`, `MES`, CQG `EP` contracts such as `F.US.EPU26`, and S&P 500 chart titles map to `MES`; `NQ`, `MNQ`, CQG `ENQ` contracts such as `F.US.ENQU26`, and NASDAQ-100 chart titles map to `MNQ`. ETF/watchlist chart prices such as `SPY` and `QQQ` are not drawn on futures charts. When RocketScooter exposes display context through those panels, for example liquidity-map codes, extractors may store that context on the matching futures family as stats.

## Stats

`stats` stores display context, not horizontal price levels:

```json
{
  "dd": 0.66,
  "riskInterval": 68.75,
  "resilience": 73.82,
  "weeklyResilience": -29.29,
  "monthlyResilience": 49.87,
  "mapCode": "BLD"
}
```

`riskInterval` is RocketScooter's RI value for the futures family. `mapCode` is the RocketScooter liquidity-map code, such as `BLD`. Direct plugins read these values from `/stats/:symbol?format=rows`; TradingView receives them as `stat` rows in the short `RSLEVELS|2` payload and displays them in the stats panel instead of drawing price lines. VARIS-style indicators can use `riskInterval`/`RI` to size VWAP bands without treating it as a price level.

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
- `zone-bull`
- `zone-bear`
- `dd-band`
- `reference`
- `open-close`
- `yellow-line`
- `red-line`
- `cat`
- `stat`
- `unknown`

`zone-bull` and `zone-bear` identify bullish/demand/support zones and bearish/supply/resistance zones. New extractors should classify zones into one of those two kinds. `zone` remains schema-compatible for older or ambiguous captures, but display plugins should avoid a separate generic Zones setting and label fallback/ambiguous kinds as `Other levels` in user-facing settings.

`yellow-line`, `red-line`, and `cat` identify user-added RocketScooter chart lines when those visible manual lines are present. Extractors may classify them by explicit labels such as `Yellow Line`, `Red Line`, `YL`, `RL`, or `CAT`, or by the visible line color when a chart object has symbol context and a finite price.

## Diagnostics

`GET /status` and `GET /diagnostics` include scrubbed `symbolSummaries` entries with symbol, display symbol, level count, captured timestamp, and symbol warnings. Display plugins and the browser extension can use these summaries to verify that a selected symbol has captured levels before requesting an export.

`GET /diagnostics` returns a scrubbed setup bundle for local support and extension troubleshooting. It includes network posture, source state, setup checks, hints, symbol names, symbol summaries, and level counts.

Captured source endpoint summaries omit raw URLs. They include only normalized endpoint keys, status codes, parser names, timestamps, and parse status.

Levels may include `metadata.endpointKey`, which is the same scrubbed endpoint key. The local service uses it to replace old rows from the same captured endpoint while preserving rows from other display endpoints for the same symbol.

## Samples And Validation

Sample payloads live in `packages/schemas/examples/`.

Run:

```powershell
node packages/schemas/test/validate-samples.test.js
```

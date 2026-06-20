# Display Plugin Contract

RS Levels plugins are display-only adapters. A plugin may draw levels from the local API, but it must never manage trades, broker state, or user accounts.

## Required Settings

Every direct API plugin should expose:

- service URL, default `http://127.0.0.1:8765`
- symbol, default platform-appropriate value such as `MES` or `MNQ`
- refresh interval, default 1000 ms
- stale threshold, default 23 hours
- line visibility by kind
- label visibility

TradingView is the exception because Pine cannot poll localhost directly. It uses the paste payload documented in [TradingView](tradingview.md).

## Required API Calls

Direct polling plugins should use:

```text
GET /status
GET /levels/:symbol
```

`GET /status` includes a stable `symbols` list and scrubbed `symbolSummaries` with per-symbol level counts. Plugins should check the selected symbol summary before treating a chart overlay as available.

Optional format-specific calls:

```text
GET /levels/:symbol?format=sierra
GET /tradingview
GET /tradingview?format=json
GET /tradingview/:symbol
GET /tradingview/:symbol?format=json
```

Plugins should normalize `ES` to `MES` and `NQ` to `MNQ` the same way the API does, or simply rely on the API response symbol. Plugins do not need RocketScooter's CQG current-contract code; `/levels/F.US.EP...` resolves to the `MES` family, and `/levels/F.US.ENQ...` resolves to the `MNQ` family.

The API sends `Cache-Control: no-store` on HTTP responses. Plugins should still poll on their own refresh interval and use `/status` freshness fields as the source of truth.

## Freshness Rules

Plugins must show feed freshness in the chart or settings panel:

- `connected`: current capture is active
- `waiting`: service is reachable but no levels have been captured
- `stale`: last capture is older than the configured threshold
- `offline`: service cannot be reached

The local service computes `source.ageMs` and marks the feed `stale` after `RS_LEVELS_STALE_MS` milliseconds, default `82800000` (23 hours). RocketScooter levels are expected to change around the early daily session window, so the default avoids marking valid daily levels stale minutes after capture. Plugins may apply their own visual threshold, but they should never show `source.state: "stale"` as live.

A stale or offline feed should never look live.

## Rendering Rules

Plugins should draw:

- horizontal lines at `level.price`
- labels from `level.name`
- kind-specific styling from `level.kind`
- optional color from `level.color`

Recommended kind colors:

```text
dd-band     #29B6F6
hp          #2962FF
mhp         #FF9800
open-close  #E0E0E0
reference   #FFEB3B
zone        #4CAF50
zone-bull   #4CAF50
zone-bear   #F06292
unknown     #9E9E9E
```

`zone-bull` and `zone-bear` are preferred when the source distinguishes bullish/demand/support zones from bearish/supply/resistance zones. Generic `zone` remains valid for sources that do not expose side.

## Safety Tests

Each plugin should include either an automated test or a manual review note proving it does not use platform APIs for:

- trade submission
- trade modification
- cancellation
- flattening
- account reads
- position reads
- PnL reads

## Error Handling

Plugins should tolerate:

- local API not started
- missing symbol data
- malformed payloads
- temporary network failures
- Tailscale/private-network URLs with normal latency

The preferred failure mode is a small stale/offline badge plus keeping the last rendered lines visually marked as stale.

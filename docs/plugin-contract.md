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

TradingView is the exception because Pine cannot poll localhost directly. It uses the short `RSLEVELS|2` paste workflow documented in [TradingView](tradingview.md).

## Required API Calls

Direct polling plugins should use:

```text
GET /status
GET /levels/:symbol
GET /stats/:symbol
```

`GET /status` includes a stable `symbols` list and scrubbed `symbolSummaries` with per-symbol level counts and display stats. Plugins should check the selected symbol summary before treating a chart overlay as available.

Optional format-specific calls:

```text
GET /levels/:symbol?format=rows
GET /stats/:symbol?format=rows
GET /tradingview
GET /tradingview/:symbol
```

Plugins should accept `ES`/`MES` and `NQ`/`MNQ` aliases the same way the API does. Plugins do not need RocketScooter's CQG current-contract code; `/levels/F.US.EP...` resolves to the ES family, and `/levels/F.US.ENQ...` resolves to the NQ family. JSON status, `/levels/:symbol` responses, and TradingView payloads use user-facing `ES`/`NQ` labels.

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
dd-band     #00BCD4
hp          #2962FF
mhp         #FF9800
open-close  #FFFFFF
reference   #FFEB3B
yellow-line #FFEB3B
red-line    #F23645
cat         #7E57C2
zone-bull   #4CAF50
zone-bear   #F06292
unknown     #9E9E9E
```

Display settings should call the fallback category `Other levels` even though the machine-readable schema kind remains `unknown`.

New extractors should emit `zone-bull` or `zone-bear` for every zone. Generic `zone` remains schema-compatible for older or ambiguous captures, but display settings should not expose a separate generic Zones toggle; treat it as `Other levels` unless a platform needs a backward-compatible neutral fallback. When a platform can draw filled regions, matching top/bottom zone rows such as `BZT1`/`BZB1`, `BrZT1`/`BrZB1`, or `Bull Zone Top`/`Bull Zone Bottom` should be filled with a low-opacity version of the matching bull or bear zone color.

Manual RocketScooter chart lines should use `yellow-line`, `red-line`, or `cat` when the extractor sees those explicit labels or their visible yellow, red, or purple line colors. Display settings should expose them as first-class categories when the platform supports kind controls.

The generic display row text feed is:

```text
name,price,red,green,blue,kind
```

Clients should read the sixth `kind` column for category-aware styling and may fall back to inferring the kind from the display name when it is absent.

Display-context stats are separate from price levels:

```text
DD,0.66
Res,73.82
MRes,49.87
WRes,-29.29
Map,BLD
```

Direct plugins should render these rows as chart-corner context when the platform supports text overlays. Bookmap may surface them in the indicator full name because its public value-line API is focused on horizontal price markers. TradingView carries these values as `stat` rows inside the `RSLEVELS|2` payload and must not draw them as price lines.

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

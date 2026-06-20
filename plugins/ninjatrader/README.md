# NinjaTrader Plugin

Display-only NinjaTrader indicator for drawing RS Levels overlays from the local API.

## Status

Specification ready. NinjaScript source is not included yet.

## Recommended API Path

```text
GET /status
GET /levels/MES
GET /levels/MNQ
```

The indicator should parse the JSON `levels` array from the symbol snapshot.

## Indicator Settings

- service URL, default `http://127.0.0.1:8765`
- symbol override, optional
- refresh interval, default 1000 ms
- stale threshold, default 10 seconds
- show labels
- line width
- enabled level kinds

## Rendering Plan

- Use a background timer or NinjaTrader-safe async pattern to poll the local API.
- Marshal results back to the chart thread before drawing.
- Draw horizontal lines by `level.price` and text by `level.name`.
- Use `level.kind` for styling and `level.color` when present.
- Show stale/offline state directly on the chart.

## Safety Boundary

This plugin must be display-only. It must not call NinjaTrader account, position, ATM, order, execution, strategy, cancel, or flatten APIs.

Review note for first NinjaScript implementation: include a static source scan for those platform APIs before release.
# Quantower Plugin

Display-only Quantower indicator for drawing RS Levels overlays from the local API.

## Status

Specification ready. Quantower indicator source is not included yet.

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
- label visibility
- enabled level kinds

## Rendering Plan

- Poll the local API from a timer that does not block chart rendering.
- Cache the latest symbol snapshot in memory.
- Draw horizontal overlays in the chart paint routine.
- Render a small freshness marker for waiting, stale, and offline states.

## Safety Boundary

This plugin must be display-only. It must not call Quantower trading, position, account, order, cancellation, or flatten APIs.

Review note for first Quantower implementation: include a source scan for trading API references before release.
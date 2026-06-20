# Bookmap Plugin

Display-only Bookmap add-on for drawing RS Levels overlays from the local API.

## Status

Specification ready. Bookmap add-on source is not included yet.

## Recommended API Path

```text
GET /status
GET /levels/MES
GET /levels/MNQ
```

The add-on should parse the JSON `levels` array from the symbol snapshot.

## Add-On Settings

- service URL, default `http://127.0.0.1:8765`
- symbol mapping to Bookmap instrument
- refresh interval, default 1000 ms
- stale threshold, default 10 seconds
- label visibility
- enabled level kinds

## Rendering Plan

- Poll the local API from an add-on worker/timer.
- Keep the most recent snapshot per symbol.
- Draw horizontal level markers on the chart using Bookmap drawing primitives.
- Mark stale/offline data in the overlay so old levels cannot look live.

## Safety Boundary

This plugin must be display-only. It must not call Bookmap trading, position, account, order, cancellation, or flatten APIs.

Review note for first Bookmap implementation: include a source scan for trading API references before release.
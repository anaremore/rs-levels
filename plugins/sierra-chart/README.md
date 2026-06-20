# Sierra Chart Plugin

Display-only Sierra Chart study for drawing RS Levels overlays from the local API.

## Status

Specification ready. ACSIL source is not included yet.

## Recommended API Path

Sierra Chart can use the Sierra text feed first:

```text
GET /status
GET /levels/MES?format=sierra
GET /levels/MNQ?format=sierra
```

Text rows are:

```text
name,price,red,green,blue
```

The study may also poll JSON from `/levels/:symbol` if the ACSIL implementation includes a JSON parser.

## Study Inputs

- service URL, default `http://127.0.0.1:8765`
- symbol, default chart symbol mapped through API aliases
- refresh interval, default 1000 ms
- stale threshold, default 10 seconds
- draw labels
- line width

## Rendering Plan

- Poll `/status` for source state and `/levels/:symbol?format=sierra` for display rows.
- Draw horizontal lines in the chart region at each price.
- Draw labels near the right edge of the chart.
- Show waiting, offline, or stale state as a small chart text marker.

## Safety Boundary

This plugin must be display-only. It must not call Sierra order-entry, trade-management, position, or account APIs.

Review note for first ACSIL implementation: search source for trade/order/account APIs before release and add the result to this README.
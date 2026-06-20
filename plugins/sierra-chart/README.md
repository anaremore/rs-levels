# Sierra Chart Plugin

Display-only Sierra Chart study for drawing RS Levels overlays from the local API.

## Status

Initial ACSIL source is included at `rs-levels-sierra.cpp`.

## API Path

The included study polls:

```text
GET /status
GET /levels/:symbol?format=sierra
```

Text rows are:

```text
name,price,red,green,blue
```

`/status` provides source freshness. The Sierra text feed provides simple rows that avoid requiring a JSON parser inside ACSIL.

## Study Inputs

- service URL, default `http://127.0.0.1:8765`
- symbol, default chart symbol mapped through API aliases
- refresh interval, default 1000 ms
- stale threshold, default 10 seconds
- draw labels
- line width

## Install

1. Copy `rs-levels-sierra.cpp` to the Sierra Chart `ACS_Source` folder.
2. In Sierra Chart, open **Analysis -> Build Custom Studies DLL**.
3. Select `rs-levels-sierra.cpp` and build it.
4. Add **RS Levels Display** to a chart.
5. Set the service URL and symbol if different from the defaults.

## Rendering Plan

- Poll `/status` for source state and `/levels/:symbol?format=sierra` for display rows.
- Draw horizontal lines in the chart region at each price.
- Draw labels near the right edge of the chart.
- Show waiting, offline, or stale state as a small chart text marker.

## Safety Boundary

This plugin must be display-only. It must not call Sierra order-entry, trade-management, position, or account APIs.

Static test coverage in `plugins/test/plugin-docs.test.cjs` checks the included source for display endpoints and blocks common Sierra trade/account API terms. The source draws chart lines, labels, and a status marker only.

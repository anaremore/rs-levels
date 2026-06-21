# Sierra Chart Plugin

Display-only Sierra Chart study for drawing RS Levels overlays from the local API.

## Status

Initial ACSIL source is included at `rs-levels-sierra.cpp`.

## API Path

The included study polls:

```text
GET /status
GET /levels/:symbol
GET /stats/:symbol
```

The Sierra study consumes the normal public JSON responses first. It uses `levels[]` rows with `name`, `price`, `kind`, and `color` fields, and `stats` fields for `DD`, `Res`, `MRes`, `WRes`, and `Map` context.

It also keeps a compatibility fallback for row feeds:

```text
GET /levels/:symbol/rows
GET /stats/:symbol/rows
name,price,red,green,blue,kind
```

`/status` provides source freshness. The level `kind` lets the study distinguish `zone-bull`, `zone-bear`, `yellow-line`, `red-line`, `cat`, and other display categories.

Blank row feeds return a newline so Sierra Chart can observe that the HTTP request completed even when no levels or stats are available yet.

## Study Inputs

- service URL, default `http://127.0.0.1:8765`
- symbol, default chart symbol mapped through API aliases
- refresh interval, default 1000 ms
- stale threshold, default 23 hours
- draw labels
- show zone fills
- zone fill opacity
- label offset ticks
- line width
- per-kind colors for DD bands, HP, MHP, open/close, references, yellow lines, red lines, CAT, bull zones, bear zones, and other levels
- show debug status, default off

## Install

1. Copy `rs-levels-sierra.cpp` to the Sierra Chart `ACS_Source` folder.
2. In Sierra Chart, open **Analysis -> Build Custom Studies DLL**.
3. Select `rs-levels-sierra.cpp` and build it.
4. Add **RS Levels Display** to a chart.
5. Set the service URL and symbol if different from the defaults.

## Rendering Plan

- Poll `/status` for source state, `/levels/:symbol` for display levels, and `GET /stats/:symbol` for DD/Res/MRes/WRes/Map context.
- Draw level lines in the chart region at each price, up to 500 rows, using the same reliable two-point ACSIL line pattern as the proven internal display study.
- Draw cleaned labels near the right edge of the chart, offset above or below the line. Labels can be hidden from the study inputs.
- Fill matched bull and bear zone top/bottom pairs with low-opacity zone color.
- Show waiting, offline, stale, timeout, and parsed row-count state as a small chart text marker, plus a bottom-left stats marker when context is available.
- When debug status is enabled, show the latest request path, response length, response shape, raw row count, parsed row count, and Sierra source build tag. This is intentionally scrubbed and hidden by default: it does not include captured RocketScooter URLs, response bodies, account data, or credentials.

## Safety Boundary

This plugin must be display-only. It must not call Sierra order-entry, trade-management, position, or account APIs.

Static test coverage in `plugins/test/plugin-docs.test.cjs` checks the included source for display endpoints and blocks common Sierra trade/account API terms. The source draws chart lines, labels, and a status marker only.

# Sierra Chart Plugin

Display-only Sierra Chart studies for drawing RS Levels overlays and VARIS Zones from the local API.

## Status

Initial ACSIL sources are included at:

- `rs-levels-sierra.cpp` for horizontal RS Levels overlays.
- `varis-zones-sierra.cpp` for VWAP-centered VARIS Zones using captured `RI`.

## API Path

The RS Levels display study polls:

```text
GET /sierra/:symbol
```

The Sierra feed is a compact plain-text response with source state, levels, and stats in one body:

```text
STATE,capturing
name,price,red,green,blue,kind
DD,0.66
Res,73.82
MRes,49.87
WRes,-29.29
Map,BLD
```

The `STATE` row provides source freshness. The level `kind` lets the study distinguish `zone-bull`, `zone-bear`, `yellow-line`, `red-line`, `cat`, and other display categories. Empty feeds still return a `STATE` row so Sierra Chart can observe that the HTTP request completed before levels are available.

`varis-zones-sierra.cpp` polls the dedicated stats row feed:

```text
GET /stats/:symbol/rows
```

It reads `RI` from that response, then computes VWAP, half-RI bands, and full-RI bands from local chart bars. It falls back to a manual risk interval input only until the API provides explicit `RI` or a display-derived RI from the captured DD bands. ES and MES resolve to the same ES-family stats, and NQ and MNQ resolve to the same NQ-family stats.

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

`VARIS Zones` adds:

- manual Risk Interval fallback
- use captured `RI` when available
- symbol override, default `Auto` from the Sierra chart symbol with ES/MES and NQ/MNQ family detection
- follow chart symbol, default on, so existing studies do not keep a stale manual symbol after rebuild
- session reset hour, default 18 ET
- show/hide VWAP, half-RI bands, full-RI bands, and status
- colors and line widths for VWAP, half-RI bands, and full-RI bands
- show debug status, default off, for the latest local request path, response length, response shape, row count, detected RI/DD rows, parsed RI, and build tag

## Install

1. Copy `rs-levels-sierra.cpp` to the Sierra Chart `ACS_Source` folder.
2. In Sierra Chart, open **Analysis -> Build Custom Studies DLL**.
3. Select `rs-levels-sierra.cpp` and build it.
4. Add **RS Levels Display** to a chart.
5. Set the service URL and symbol if different from the defaults.

For VARIS Zones, copy `varis-zones-sierra.cpp`, build it the same way, and add **VARIS Zones** to the chart. The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`.

Existing Sierra studies preserve input values across rebuilds. After updating VARIS Zones, confirm the on-chart status marker shows the current `varis-sierra-...` build tag and the settings include `Follow chart symbol`. If the marker still shows an older build tag, copy the current `varis-zones-sierra.cpp` into `ACS_Source`, rebuild that file, and re-add or reset the study. `Follow chart symbol` defaults on and is auto-enabled once for upgraded study instances. During that migration, old `ES`, `MES`, `NQ`, or `MNQ` symbol overrides are reset to `Auto` so an old `MES` input cannot keep an NQ/MNQ chart on the ES family.

## Rendering Plan

- Poll `/sierra/:symbol` for RS Levels source state, display levels, and DD/Res/MRes/WRes/Map context in one response.
- Poll `/stats/:symbol/rows` for VARIS Zones `RI`, with `Auto` symbol detection from the Sierra chart symbol.
- Draw level lines in the chart region at each price, up to 500 rows, using the same reliable two-point ACSIL line pattern as the proven internal display study. Multiple yellow-line and red-line rows are drawn independently, including numbered RocketScooter aliases such as `YL2` and `RL3`.
- Draw cleaned labels near the right edge of the chart, offset above or below the line. Labels can be hidden from the study inputs.
- Suppress duplicate same-name open/close rows from noisy feeds, so only one `Close` label is drawn while independent manual lines still remain separate by price.
- Fill matched bull and bear zone top/bottom pairs with low-opacity zone color.
- Show waiting, offline, stale, timeout, and parsed row-count state as a small chart text marker, plus a bottom-left stats marker when context is available.
- When debug status is enabled, show the latest request path, response length, response shape, raw row count, parsed row count, and Sierra source build tag. This is intentionally scrubbed and hidden by default: it does not include captured RocketScooter URLs, response bodies, account data, or credentials.
- The VARIS Zones status marker says `API RI` when the study is using captured or derived API RI, and `manual RI` while it is falling back to the manual input. The marker includes the source build tag so stale compiled studies are easy to spot. Its optional debug marker is hidden by default and shows only scrubbed transport details such as `/stats/:symbol/rows`, response length, response shape, row count, detected RI, parsed RI, and build tag.

## Safety Boundary

This plugin must be display-only. It must not call Sierra order-entry, trade-management, position, or account APIs.

Static test coverage in `plugins/test/plugin-docs.test.cjs` checks the included source for display endpoints and blocks common Sierra trade/account API terms. The source draws chart lines, labels, and a status marker only.

# Quantower Plugin

Display-only Quantower indicators for drawing RS Levels overlays and VARIS Zones from the local API.

## Status

Initial Quantower indicator sources are included at:

- `RSLevelsDisplayQuantower.cs` for horizontal RS Levels overlays.
- `VARISZonesQuantower.cs` for VWAP-centered VARIS Zones using captured `RI`.

## API Path

```text
GET /status
GET /levels/:symbol?format=rows
GET /stats/:symbol?format=rows
```

The indicator uses generic text row feeds to keep parsing simple inside Quantower. `/levels/:symbol?format=rows` provides horizontal display levels. `/stats/:symbol?format=rows` provides chart-corner display context such as `DD`, `Res`, `MRes`, `WRes`, and `Map`. `/status` provides source freshness.

`VARISZonesQuantower.cs` polls `/status` and `/stats/:symbol?format=rows`, reads the `RI` row, then computes VWAP, half-RI bands, and full-RI bands from local chart bars. It falls back to a manual risk interval input when captured `RI` is unavailable.

## Indicator Settings

- service URL, default `http://127.0.0.1:8765`
- symbol override, optional
- refresh interval, default 1000 ms
- stale threshold, default 23 hours
- label visibility
- zone fill visibility
- zone fill opacity
- label vertical offset
- line width

`VARIS Zones Quantower` adds:

- manual Risk Interval fallback
- use captured `RI` when available
- show/hide VWAP, half-RI bands, full-RI bands, fills, and status
- fill opacity

## Install

1. Open Quantower Algo in Visual Studio.
2. Create or open an indicator project.
3. Add `RSLevelsDisplayQuantower.cs` to the project.
4. Build the indicator.
5. Add **RS Levels Display** to a chart.
6. Set the service URL and symbol override if needed.

For VARIS Zones, add `VARISZonesQuantower.cs` to the same project, build it, and add **VARIS Zones Quantower** to the chart. The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`.

## Rendering Plan

- Poll the local API from a timer that does not block chart rendering.
- Cache the latest symbol snapshot in memory.
- Draw horizontal overlays in the chart paint routine, including yellow-line, red-line, and CAT manual-line kinds from the row feed.
- Preserve multiple yellow-line and red-line rows when RocketScooter exposes several manual lines at different prices.
- Fill matched bull and bear zone top/bottom pairs with low-opacity zone color.
- Offset labels above or below the line to avoid struck-through text.
- Render DD/Res/MRes/WRes/Map context in the chart corner when available.
- Render a small freshness marker for waiting, stale, and offline states.

## Safety Boundary

This plugin must be display-only. It must not call Quantower trading, position, account, order, cancellation, or flatten APIs.

Static test coverage in `plugins/test/plugin-docs.test.cjs` checks the included source for display endpoints and blocks common Quantower trade/account API terms. The source paints chart lines, labels, and a status marker only.

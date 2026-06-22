# NinjaTrader Plugin

Display-only NinjaTrader indicators for drawing RS Levels overlays and VARIS Zones from the local API.

## Status

Initial NinjaScript sources are included at:

- `RSLevelsDisplay.cs` for horizontal RS Levels overlays.
- `VARISZones.cs` for VWAP-centered VARIS Zones using captured `RI`.

## API Path

```text
GET /status
GET /levels/:symbol?format=rows
GET /stats/:symbol?format=rows
```

The indicator uses generic text row feeds to avoid adding a JSON dependency inside NinjaTrader. `/levels/:symbol?format=rows` provides horizontal display levels. `/stats/:symbol?format=rows` provides chart-corner display context such as `DD`, `Res`, `MRes`, `WRes`, and `Map`. `/status` provides source freshness.

`VARISZones.cs` polls `/status` and `/stats/:symbol?format=rows`, reads the `RI` row, then computes VWAP, half-RI bands, and full-RI bands from local chart bars. It falls back to a manual risk interval input when captured `RI` is unavailable.

## Indicator Settings

- service URL, default `http://127.0.0.1:8765`
- symbol override, optional
- refresh interval, default 1000 ms
- stale threshold, default 23 hours
- show labels
- show zone fills
- zone fill opacity
- label offset ticks

`VARIS Zones` adds:

- manual Risk Interval fallback
- use captured `RI` when available
- show/hide VWAP, half-RI bands, full-RI bands, and status
- plot colors/widths through NinjaTrader plot styling

## Install

1. Copy `RSLevelsDisplay.cs` to the NinjaTrader custom indicators folder:

```text
Documents\NinjaTrader 8\bin\Custom\Indicators\RSLevelsDisplay.cs
```

2. Open the NinjaScript editor.
3. Compile custom indicators.
4. Add **RS Levels Display** to a chart.
5. Set the service URL and symbol override if needed.

For VARIS Zones, copy `VARISZones.cs` to the same folder, compile it, and add **VARIS Zones** to the chart. The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`.

## Rendering Plan

- Use a background timer or NinjaTrader-safe async pattern to poll the local API.
- Marshal results back to the chart thread before drawing.
- Draw horizontal lines by `level.price` and text by `level.name`.
- Use the display row feed color columns and optional sixth `kind` column for display styling, including yellow-line, red-line, and CAT manual-line kinds.
- Preserve multiple yellow-line and red-line rows when RocketScooter exposes several manual lines at different prices.
- Fill matched bull and bear zone top/bottom pairs with low-opacity zone color.
- Offset labels above or below the level line to avoid struck-through text.
- Render DD/Res/MRes/WRes/Map context in the chart corner when the local API has it.
- Show stale/offline state directly on the chart.

## Safety Boundary

This plugin must be display-only. It must not call NinjaTrader account, position, ATM, order, execution, strategy, cancel, or flatten APIs.

Static test coverage in `plugins/test/plugin-docs.test.cjs` checks the included source for display endpoints and blocks common NinjaTrader trade/account API terms. The source draws chart lines, labels, and a status marker only.

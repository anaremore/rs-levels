# Quantower Plugin

Display-only Quantower indicator for drawing RS Levels overlays from the local API.

## Status

Initial Quantower indicator source is included at `RSLevelsDisplayQuantower.cs`.

## API Path

```text
GET /status
GET /levels/:symbol?format=rows
```

The indicator uses the generic display row feed to keep parsing simple inside Quantower. `/status` provides source freshness.

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

## Install

1. Open Quantower Algo in Visual Studio.
2. Create or open an indicator project.
3. Add `RSLevelsDisplayQuantower.cs` to the project.
4. Build the indicator.
5. Add **RS Levels Display** to a chart.
6. Set the service URL and symbol override if needed.

## Rendering Plan

- Poll the local API from a timer that does not block chart rendering.
- Cache the latest symbol snapshot in memory.
- Draw horizontal overlays in the chart paint routine.
- Fill matched bull and bear zone top/bottom pairs with low-opacity zone color.
- Offset labels above or below the line to avoid struck-through text.
- Render a small freshness marker for waiting, stale, and offline states.

## Safety Boundary

This plugin must be display-only. It must not call Quantower trading, position, account, order, cancellation, or flatten APIs.

Static test coverage in `plugins/test/plugin-docs.test.cjs` checks the included source for display endpoints and blocks common Quantower trade/account API terms. The source paints chart lines, labels, and a status marker only.

# NinjaTrader Plugin

Display-only NinjaTrader indicator for drawing RS Levels overlays from the local API.

## Status

Initial NinjaScript source is included at `RSLevelsDisplay.cs`.

## API Path

```text
GET /status
GET /levels/:symbol?format=sierra
```

The first indicator source uses the Sierra text feed to avoid adding a JSON dependency inside NinjaTrader. `/status` provides source freshness.

## Indicator Settings

- service URL, default `http://127.0.0.1:8765`
- symbol override, optional
- refresh interval, default 1000 ms
- stale threshold, default 10 seconds
- show labels
- line width

## Install

1. Copy `RSLevelsDisplay.cs` to the NinjaTrader custom indicators folder:

```text
Documents\NinjaTrader 8\bin\Custom\Indicators\RSLevelsDisplay.cs
```

2. Open the NinjaScript editor.
3. Compile custom indicators.
4. Add **RS Levels Display** to a chart.
5. Set the service URL and symbol override if needed.

## Rendering Plan

- Use a background timer or NinjaTrader-safe async pattern to poll the local API.
- Marshal results back to the chart thread before drawing.
- Draw horizontal lines by `level.price` and text by `level.name`.
- Use `level.kind` for styling and `level.color` when present.
- Show stale/offline state directly on the chart.

## Safety Boundary

This plugin must be display-only. It must not call NinjaTrader account, position, ATM, order, execution, strategy, cancel, or flatten APIs.

Static test coverage in `plugins/test/plugin-docs.test.cjs` checks the included source for display endpoints and blocks common NinjaTrader trade/account API terms. The source draws chart lines, labels, and a status marker only.

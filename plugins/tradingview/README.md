# TradingView

Display-only Pine indicator for RS Levels.

TradingView Pine scripts cannot poll the local API directly. The RS Levels workflow is copy/paste:

1. Run the local service.
2. Capture RocketScooter levels with the browser extension or another approved local capture client.
3. Use `Copy JSON` in the extension popup, or copy JSON from `http://127.0.0.1:8765/tradingview`.
4. Add `rs-levels.pine` to a TradingView chart and paste the JSON into the indicator input.

The all-symbol JSON export can carry `ES` and `NQ` together. The indicator chooses the matching section for ES/MES or NQ/MNQ charts.

## Payload Format

```json
{
  "schemaVersion": "0.1.0",
  "exportFormat": "tradingview-bundle-json",
  "payloadVersion": 2,
  "generatedAt": "2026-06-19T14:30:00.000Z",
  "symbols": [
    {
      "symbol": "ES",
      "capturedAt": "2026-06-19T14:29:59.500Z",
      "levelCount": 2,
      "levels": [["OVNHP", 7537, "hp"], ["BZT1", 7588, "zone-bull"]]
    }
  ]
}
```

Single-symbol exports use `exportFormat: "tradingview-json"` with top-level `symbol`, `capturedAt`, and `levels` fields. Each level row is `[name, price, kind]`.

## Safety Boundary

This indicator only draws lines, labels, and zone fills. It does not contain strategy logic, alerts, order placement, broker connectivity, account reads, PnL reads, or automation.

## Indicator Controls

- `RS Levels JSON`: JSON from the extension or local API.
- `Labels`: show or hide level labels.
- Kind toggles: DD bands, HP, MHP, open/close, references, zones, bull zones, bear zones, and other levels. Each colored kind has its color picker on the same row as its checkbox.
- `Zone fills` and `Zone fill opacity %`: fill matched zone top/bottom pairs with a low-opacity version of the bull or bear zone color.
- `Line width`, `Font size`, `Label bar offset`, `Label vertical offset (ticks)`, `Max levels`, and `Line style`: display-only drawing preferences. Level labels render a few ticks above or below their line, automatically stagger into rows/columns, and trim RocketScooter drawing metadata such as `horizontal`, `text`, and `Liquidity Map` from display labels.

The pasted JSON input is hidden from TradingView's status line to avoid chart-header clutter. The local API export includes all returned levels; the Pine indicator draws up to TradingView's drawing limits.

`Other levels` is the fallback display category for parsed levels whose kind is not one of the recognized DD, HP, MHP, open/close, reference, or zone kinds.

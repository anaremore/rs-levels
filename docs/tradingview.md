# TradingView

TradingView Pine scripts cannot poll the local API directly, so RS Levels uses a copy/paste JSON workflow.

1. Run the local service.
2. Capture RocketScooter levels with the browser extension.
3. Use `Copy JSON` in the extension popup.
4. Add `plugins/tradingview/rs-levels.pine` to a TradingView chart.
5. Paste the copied JSON into the hidden `RS Levels JSON` indicator input.

The all-symbol export carries `ES` and `NQ` together. The indicator detects the current TradingView chart family and draws `ES` levels on ES/MES charts, or `NQ` levels on NQ/MNQ charts. If TradingView symbol metadata is ambiguous, Auto falls back to the section whose level prices are closest to the chart's current price, and the `Chart family` setting can force `ES` or `NQ`. SPY, QQQ, and other non-futures panels may be open in RocketScooter without being included in the TradingView export.

## API

```text
GET /tradingview
GET /tradingview/ES
GET /tradingview/NQ
GET /tradingview/F.US.EP...
GET /tradingview/F.US.ENQ...
```

Bundle JSON:

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

Single-symbol JSON:

```json
{
  "schemaVersion": "0.1.0",
  "exportFormat": "tradingview-json",
  "payloadVersion": 1,
  "generatedAt": "2026-06-19T14:30:00.000Z",
  "symbol": "ES",
  "capturedAt": "2026-06-19T14:29:59.500Z",
  "levels": [["OVNHP", 7537, "hp"], ["DD", 7579.75, "dd-band"]]
}
```

Each level row is `[name, price, kind]`. Bull and bear zones use `zone-bull` and `zone-bear` kinds when the source distinguishes them. Generic `zone` is still displayed as a neutral zone. When the payload includes matching top/bottom names such as `BZT1`/`BZB1`, `BrZT1`/`BrZB1`, or `Bull Zone Top`/`Bull Zone Bottom`, the indicator fills the area between those boundaries.

## Indicator Controls

- `RS Levels JSON`: JSON copied from the extension or local API. It is hidden from TradingView's status line to avoid chart-header clutter.
- `Chart family`: leave on `Auto` for normal ES/MES and NQ/MNQ charts, or force `ES`/`NQ` if TradingView symbol metadata prevents automatic matching.
- `Labels`: show or hide level labels.
- Kind toggles: DD bands, HP, MHP, open/close, references, zones, bull zones, bear zones, and other levels. Each colored kind has its color picker on the same row as its checkbox.
- `Zone fills` and `Zone fill opacity %`: fill matched zone top/bottom pairs with a low-opacity version of the bull or bear zone color.
- `Line width`, `Font size`, `Label bar offset`, `Label vertical offset (ticks)`, `Max levels`, and `Line style`: display-only drawing preferences.

Level labels render a few ticks above or below their line, automatically stagger into rows/columns, and trim RocketScooter drawing metadata such as `horizontal`, `text`, and `Liquidity Map` from display labels.

`Other levels` is the fallback display category for parsed levels whose kind is not one of the recognized DD, HP, MHP, open/close, reference, or zone kinds.

## Safety Boundary

This indicator only draws lines, labels, and zone fills. It does not contain strategy logic, alerts, order placement, broker connectivity, account reads, PnL reads, or automation.

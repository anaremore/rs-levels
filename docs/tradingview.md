# TradingView

TradingView Pine scripts cannot poll the local API directly, so RS Levels uses a small copy/paste payload built for Pine.

1. Run the local service.
2. Capture RocketScooter levels with the browser extension.
3. Use `Copy TradingView` in the extension popup.
4. Add `plugins/tradingview/rs-levels.pine` to a TradingView chart.
5. Paste the copied payload into the `RS Levels Payload` input, then click `OK`.

The all-symbol export carries `ES` and `NQ` together. In `Auto`, the indicator detects ES/MES or NQ/MNQ from TradingView's chart symbol metadata and uses the matching section. The `Chart family` setting can force `ES` or `NQ` when needed. SPY, QQQ, and other non-futures panels may be open in RocketScooter without being included in the TradingView export.

The extension can copy the TradingView payload from its latest normalized page-reader capture without the local API. If no extension-local payload is available, it falls back to the local `/tradingview` endpoint.

## API

```text
GET /tradingview
GET /tradingview/ES
GET /tradingview/NQ
GET /tradingview/F.US.EP...
GET /tradingview/F.US.ENQ...
```

All-symbol payload:

```text
RSLEVELS|2|2026-06-19T14:30:00.000Z|ES|2026-06-19T14:29:59.500Z|OVNHP,7537,hp;BZT1,7588,zone-bull|NQ|2026-06-19T14:29:59.500Z|OVNMHP,30475,mhp
```

Single-symbol payload:

```text
RSLEVELS|2|2026-06-19T14:30:00.000Z|ES|2026-06-19T14:29:59.500Z|OVNHP,7537,hp;DD,7579.75,dd-band
```

The payload shape is `RSLEVELS|2|generatedAt|symbol|capturedAt|name,price,kind;...`. Additional symbols repeat the last three fields. Bull and bear zones use `zone-bull` and `zone-bear` kinds. When the payload includes matching top/bottom names such as `BZT1`/`BZB1`, `BrZT1`/`BrZB1`, or `Bull Zone Top`/`Bull Zone Bottom`, the indicator fills the area between those boundaries.

## Indicator Controls

- `RS Levels Payload`: `RSLEVELS|2` text copied from the extension or local API. It uses TradingView's single-row text input and is hidden from the status line to avoid chart-header clutter.
- `Chart family`: leave on `Auto` for normal ES/MES and NQ/MNQ charts, or force `ES`/`NQ` when you intentionally want a specific bundle section.
- `Labels`: show or hide level labels.
- Kind toggles: DD bands, HP, MHP, open/close, references, bull zones, bear zones, and other levels. Each colored kind keeps its checkbox and color picker on one row.
- `Zone fills` and `Zone fill opacity %`: fill matched zone top/bottom pairs with a low-opacity version of the bull or bear zone color.
- `Line width`, `Font size`, `Label bar offset`, `Label vertical offset (ticks)`, `Max levels`, and `Line style`: display-only drawing preferences.

Level labels render a few ticks above or below their line, automatically stagger into rows/columns, and trim RocketScooter drawing metadata such as `horizontal`, `text`, and `Liquidity Map` from display labels.

`Other levels` is the fallback display category for parsed levels whose kind is not one of the recognized DD, HP, MHP, open/close, reference, bull zone, or bear zone kinds.

## Safety Boundary

This indicator only draws lines, labels, and zone fills. It does not contain strategy logic, alerts, order placement, broker connectivity, account reads, PnL reads, or automation.

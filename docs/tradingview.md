# TradingView

TradingView Pine scripts cannot poll the local API directly, so RS Levels uses a small copy/paste payload built for Pine.

1. Run the local service.
2. Capture RocketScooter levels with the browser extension.
3. Use `Copy TradingView` in the extension popup.
4. Add `plugins/tradingview/rs-levels.pine` to a TradingView chart. For VARIS Zones, add `plugins/tradingview/varis-zones.pine`.
5. Paste the copied payload into the `RS Levels Payload` input, then click `OK`.

The all-symbol export carries `ES` and `NQ` together. In `Auto`, the indicator detects ES/MES or NQ/MNQ from TradingView's chart symbol metadata and uses the matching section. The `Chart family` setting can force `ES` or `NQ` when needed. SPY, QQQ, and other non-futures panels may be open in RocketScooter without being included in the TradingView export.

The extension can copy the TradingView payload from its latest normalized page-reader capture without the local API. If no extension-local payload is available, it falls back to the local `/tradingview` endpoint.

`varis-zones.pine` is a separate display-only TradingView indicator based on the VARIS Zones concept credited to RocketScooter community member `IAmTheLiquidity2`. It uses the same copied payload and reads the `RI` stat row for the matching ES/MES or NQ/MNQ chart family. See [VARIS Zones](varis-zones.md).

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
RSLEVELS|2|2026-06-19T14:30:00.000Z|ES|2026-06-19T14:29:59.500Z|OVNHP,7537,hp;Bull Zone Top 1,7588,zone-bull;DD,0.66,stat;RI,68.75,stat;Map BLD,0,stat|NQ|2026-06-19T14:29:59.500Z|OVNMHP,30475,mhp;Bear Zone Top 1,30450,zone-bear;RI,266.25,stat;Res,73.82,stat;MRes,49.87,stat;WRes,-29.29,stat
```

Single-symbol payload:

```text
RSLEVELS|2|2026-06-19T14:30:00.000Z|ES|2026-06-19T14:29:59.500Z|OVNHP,7537,hp;DD,7579.75,dd-band
```

The payload shape is `RSLEVELS|2|generatedAt|symbol|capturedAt|name,price,kind;...`. Additional symbols repeat the last three fields. Bull and bear zones use `zone-bull` and `zone-bear` kinds and current TradingView exports name boundaries as `Bull Zone Top`, `Bull Zone Bottom`, `Bear Zone Top`, and `Bear Zone Bottom`, with optional occurrence numbers to keep repeated top/bottom pairs distinct for fills. Pine displays the clean boundary label without the occurrence number. User-added RocketScooter yellow, red, and purple CAT lines use `yellow-line`, `red-line`, and `cat` kinds. DD/RI/Res/MRes/WRes/Map context uses `stat` rows and is never drawn as price lines. The RS Levels TradingView panel intentionally shows only Map and RI because DD/Res/MRes/WRes can change quickly during regular trading hours while TradingView Pine cannot poll the local live API. VARIS-style Pine indicators can use the same pasted payload to read `RI` as their risk interval. Explicit captured `RI` wins; if RocketScooter exposes DD bands but no explicit RI, the TradingView exporter derives a display fallback from the outer DD-band pair. When the browser extension sees RocketScooter zone rectangles, those exact rectangle top/bottom prices are preferred and the separate generic zone label is consumed. DD-bounded zone reconstruction is retained only for older captures that expose a generic horizontal `Bull Zone` or `Bear Zone` row without rectangle geometry. Compact `BZT`/`BZB` and `BrZT`/`BrZB` names remain accepted for older pasted payloads and platform adapter feeds.

## Indicator Controls

- `RS Levels Payload`: `RSLEVELS|2` text copied from the extension or local API. It uses TradingView's single-row text input and is hidden from the status line to avoid chart-header clutter.
- `Chart family`: leave on `Auto` for normal ES/MES and NQ/MNQ charts, or force `ES`/`NQ` when you intentionally want a specific bundle section.
- `Labels`: show or hide level labels.
- `Stats panel`: show or hide Map and RI context from `stat` rows.
- `Stats panel position` and `Stats panel bottom padding`: defaults to bottom-left with a transparent spacer row so the panel sits above TradingView's lower-left watermark; move it or adjust the padding when your chart layout needs it.
- Kind toggles: DD bands, HP, MHP, open/close, references, yellow lines, red lines, CAT lines, bull zones, bear zones, and other levels. Each colored kind keeps its checkbox and color picker on one row. Yellow lines default to yellow, red lines default to red, and CAT lines default to purple; the indicator honors those visible manual-line names even if a captured row arrives with a generic kind.
- `Zone fills` and `Zone fill opacity %`: fill matched explicit top/bottom pairs with a low-opacity version of the bull or bear zone color.
- `Line width`, `Font size`, `Label bar offset`, `Min label vertical offset (ticks)`, `Max levels`, and `Line style`: display-only drawing preferences.

Level labels render above or below their own line using dynamic spacing from the visible chart range and the drawn level range, with the tick input acting as a minimum. Nearby labels stagger into rows/columns only when their prices cluster, so unrelated levels do not push zone labels away from their boundaries. Labels trim RocketScooter drawing metadata such as `horizontal`, `text`, and `Liquidity Map` from display labels. `MidGap`, `Mid Gap`, `HalfGap`, and `HG` rows display as `Half Gap`; Half Gap lines are dashed even when the default line style is solid.

`Other levels` is the fallback display category for parsed levels whose kind is not one of the recognized DD, HP, MHP, open/close, reference, manual line, bull zone, or bear zone kinds.

## Safety Boundary

This indicator only draws lines, labels, and zone fills. It does not contain strategy logic, alerts, order placement, broker connectivity, account reads, PnL reads, or automation.

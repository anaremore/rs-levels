# TradingView

Display-only Pine indicator for RS Levels.

For the shortest extension-plus-indicator setup, see [TradingView quickstart](../../docs/tradingview-quickstart.md).

TradingView Pine scripts cannot poll the local API directly. The RS Levels workflow is copy/paste:

1. Run the local service.
2. Capture RocketScooter levels with the browser extension or another approved local capture client.
3. Use `Copy TradingView` in the extension popup, or copy the text from `http://127.0.0.1:8765/tradingview`.
4. Add `rs-levels.pine` to a TradingView chart, paste the payload into the `RS Levels Payload` input, and click `OK`.

`varis-zones.pine` is a separate display-only VARIS Zones indicator. It uses the same copied payload, reads the `RI` stat row for the matching chart family, and falls back to a manual risk interval input when no pasted RI is present. The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`.

The extension payload can carry every supported symbol detected in the open RocketScooter chart grid. In `Auto`, the indicator maps futures charts to `ES` or `NQ` and matches stock charts by ticker, such as `NVDA`. The manual `Chart family` override remains available for futures.

Optional RocketScooter lines must exist before you copy the payload. Stock HP/MHP and liquidity-map context are included only when that stock has a supported chart open in RocketScooter. Futures manual yellow/red/CAT lines keep their existing pass-through behavior.

## Payload Format

```text
RSLEVELS|2|2026-07-09T20:08:23.000Z|ES|2026-07-09T20:08:22.000Z|OVNHP,7537,hp;RI,68.75,stat|NVDA|2026-07-09T20:08:22.000Z|HP,202.5,hp;MHP,205,mhp;Map BLD,0,stat
```

The payload shape is `RSLEVELS|2|generatedAt|symbol|capturedAt|name,price,kind;...`. Additional symbols repeat the last three fields. User-added RocketScooter yellow, red, and purple CAT lines use `yellow-line`, `red-line`, and `cat` kinds, and multiple yellow/red rows are drawn independently when their prices differ. Bull and bear zones use `zone-bull` and `zone-bear`; current TradingView exports name boundaries as `Bull Zone Top`, `Bull Zone Bottom`, `Bear Zone Top`, and `Bear Zone Bottom`, with optional occurrence numbers so repeated pairs remain distinct for fills. Pine displays clean boundary labels without the occurrence number. When RocketScooter exposes zone rectangles separately from text labels, the extension and API prefer the exact rectangle top/bottom boundaries and consume the matched generic zone label. DD-bounded reconstruction remains only as a compatibility fallback for older captures that expose generic horizontal `Bull Zone` or `Bear Zone` rows without rectangle geometry. Compact `BZT`/`BZB` and `BrZT`/`BrZB` names remain accepted for older pasted payloads and platform adapter feeds. DD/RI/Res/MRes/WRes/Map context uses `stat` rows; the RS Levels indicator renders Map and RI in its stats panel and does not draw stats as price lines. VARIS-style Pine indicators can read `RI` from the same pasted payload.

## Safety Boundary

These indicators only draw overlays. They do not contain strategy logic, alerts, order placement, broker connectivity, account reads, PnL reads, or automation.

## Indicator Controls

- `RS Levels Payload`: `RSLEVELS|2` text from the extension or local API, pasted into TradingView's single-row text input.
- `Chart family`: leave on `Auto` for stock ticker matching and normal futures detection; `ES` and `NQ` are futures-only overrides.
- `Label layout`: `Rail` (default) docks high-contrast dark chips near the chart's visible right boundary and adds subtle leaders when collision spacing moves a label; `On line` uses lightweight white text just off each price line and spreads crowded labels horizontally; `Hidden` removes labels while keeping level lines.
- `Stats panel`: show or hide Map and RI context from `stat` rows.
- Kind toggles: DD bands, HP, MHP, open/close, references, yellow lines, red lines, CAT lines, bull zones, bear zones, and other levels. Each colored kind keeps its checkbox and color picker on one row.
- Yellow lines default to yellow, red lines default to red, and CAT lines default to purple. The indicator normalizes captured name/kind text before applying these colors.
- `Zone fills` and `Zone fill opacity %`: fill matched explicit top/bottom pairs with a low-opacity version of the bull or bear zone color.
- `Line width`, `Font size`, `Rail inset %`, `Min label vertical offset (ticks)`, `Max levels`, and `Line style`: display-only drawing preferences. `Rail inset %` keeps docked chips clear of the price scale; `On line` follows the visible chart range. Labels use the consistent `Name · Price` format and trim RocketScooter drawing metadata such as `horizontal`, `text`, and `Liquidity Map`. `MidGap`, `Mid Gap`, `HalfGap`, and `HG` rows display as `Half Gap`; Half Gap lines are always dashed.

The pasted payload input is hidden from TradingView's status line to avoid chart-header clutter. The local API export includes all returned levels; the Pine indicator draws up to TradingView's drawing limits.

`Other levels` is the fallback display category for parsed levels whose kind is not one of the recognized DD, HP, MHP, open/close, reference, manual line, bull zone, or bear zone kinds.

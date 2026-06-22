# TradingView

Display-only Pine indicator for RS Levels.

TradingView Pine scripts cannot poll the local API directly. The RS Levels workflow is copy/paste:

1. Run the local service.
2. Capture RocketScooter levels with the browser extension or another approved local capture client.
3. Use `Copy TradingView` in the extension popup, or copy the text from `http://127.0.0.1:8765/tradingview`.
4. Add `rs-levels.pine` to a TradingView chart, paste the payload into the `RS Levels Payload` input, and click `OK`.

`varis-zones.pine` is a separate display-only VARIS Zones indicator. It uses the same copied payload, reads the `RI` stat row for the matching chart family, and falls back to a manual risk interval input when no pasted RI is present. The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`.

The all-symbol payload can carry `ES` and `NQ` together. In `Auto`, the indicator detects ES/MES or NQ/MNQ from TradingView's chart symbol metadata and uses the matching section. If TradingView does not expose enough symbol context, use the `Chart family` override.

## Payload Format

```text
RSLEVELS|2|2026-06-19T14:30:00.000Z|ES|2026-06-19T14:29:59.500Z|OVNHP,7537,hp;BZT1,7588,zone-bull;RI,68.75,stat|NQ|2026-06-19T14:29:59.500Z|OVNMHP,30475,mhp;RI,266.25,stat
```

The payload shape is `RSLEVELS|2|generatedAt|symbol|capturedAt|name,price,kind;...`. Additional symbols repeat the last three fields. User-added RocketScooter yellow, red, and purple CAT lines use `yellow-line`, `red-line`, and `cat` kinds, and multiple yellow/red rows are drawn independently when their prices differ. DD/RI/Res/MRes/WRes/Map context uses `stat` rows; the RS Levels indicator renders those values in its stats panel and does not draw them as price lines. VARIS-style Pine indicators can read `RI` from the same pasted payload.

## Safety Boundary

These indicators only draw overlays. They do not contain strategy logic, alerts, order placement, broker connectivity, account reads, PnL reads, or automation.

## Indicator Controls

- `RS Levels Payload`: `RSLEVELS|2` text from the extension or local API, pasted into TradingView's single-row text input.
- `Chart family`: `Auto`, `ES`, or `NQ`.
- `Labels`: show or hide level labels.
- `Stats panel`: show or hide DD/RI/Res/MRes/WRes/Map context from `stat` rows.
- Kind toggles: DD bands, HP, MHP, open/close, references, yellow lines, red lines, CAT lines, bull zones, bear zones, and other levels. Each colored kind keeps its checkbox and color picker on one row.
- Yellow lines default to yellow, red lines default to red, and CAT lines default to purple. The indicator normalizes captured name/kind text before applying these colors.
- `Zone fills` and `Zone fill opacity %`: fill matched zone top/bottom pairs with a low-opacity version of the bull or bear zone color.
- `Line width`, `Font size`, `Label bar offset`, `Min label vertical offset (ticks)`, `Max levels`, and `Line style`: display-only drawing preferences. Level labels render above or below their line using dynamic spacing from the visible chart range and drawn level range, with the tick input acting as a minimum. Labels automatically stagger into rows/columns and trim RocketScooter drawing metadata such as `horizontal`, `text`, and `Liquidity Map` from display labels.

The pasted payload input is hidden from TradingView's status line to avoid chart-header clutter. The local API export includes all returned levels; the Pine indicator draws up to TradingView's drawing limits.

`Other levels` is the fallback display category for parsed levels whose kind is not one of the recognized DD, HP, MHP, open/close, reference, manual line, bull zone, or bear zone kinds.

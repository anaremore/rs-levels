# TradingView

Display-only Pine indicator for RS Levels.

TradingView Pine scripts cannot poll the local API directly. The RS Levels workflow is copy/paste:

1. Run the local service.
2. Capture RocketScooter levels with the browser extension or another approved local capture client.
3. Open `http://127.0.0.1:8765/tradingview` or use `Copy TradingView` in the extension popup.
4. Copy the compact `RSLEVELS|...` payload. The all-symbol payload can carry MES and MNQ together.
5. Add `rs-levels.pine` to a TradingView chart and paste the payload into the indicator input.

JSON export is also available for tooling and manual inspection:

```text
http://127.0.0.1:8765/tradingview/MES?format=json
http://127.0.0.1:8765/tradingview?format=json
```

The JSON export includes `compactPayload` for tools that want the exact Pine-ready string alongside structured rows.

## Safety Boundary

This indicator only draws lines and labels. It does not contain strategy logic, alerts, order placement, broker connectivity, account reads, PnL reads, or automation.

## Indicator Controls

- `RS Levels Payload`: compact `RSLEVELS|...` text from the extension or local API. The current indicator accepts v1 single-symbol payloads and v2 all-symbol payloads.
- `Labels`: show or hide level labels.
- Kind toggles: DD bands, HP, MHP, open/close, references, zones, bull zones, bear zones, and other levels. Each colored kind has its color picker on the same row as its checkbox.
- `Zone fills` and `Zone fill opacity %`: fill matched zone top/bottom pairs with a low-opacity version of the bull or bear zone color.
- `Line width`, `Font size`, `Label bar offset`, `Label vertical offset (ticks)`, `Max levels`, and `Line style`: display-only drawing preferences. Level labels render a few ticks above or below their line, automatically stagger into rows/columns, and trim RocketScooter drawing metadata such as `horizontal`, `text`, and `Liquidity Map` from display labels.

The pasted payload input is hidden from TradingView's status line to avoid chart-header clutter. The local API export includes all returned levels; the Pine indicator draws up to TradingView's drawing limits.

`Other levels` is the fallback display category for parsed levels whose kind is not one of the recognized DD, HP, MHP, open/close, reference, or zone kinds.

## Payload Format

```text
RSLEVELS|1|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp;DD Upper,7579.75,dd-band
```

Fields:

- prefix: `RSLEVELS`
- payload version: `1`
- symbol: normalized display symbol
- captured timestamp
- semicolon-separated `name,price,kind` rows

All-symbol v2 payloads use repeated symbol sections:

```text
RSLEVELS|2|2026-06-19T14:30:00.000Z|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp|MNQ|2026-06-19T14:29:59.500Z|BrZT1,30450.00,zone-bear
```

Bull and bear zones use `zone-bull` and `zone-bear` kinds when the source distinguishes them. Generic `zone` is still accepted. When the payload includes matching top/bottom names such as `BZT1`/`BZB1`, `BrZT1`/`BrZB1`, or `Bull Zone Top`/`Bull Zone Bottom`, the indicator fills the area between those boundaries.

The local service sanitizes delimiters in level names so Pine can parse the payload with `str.split()`.

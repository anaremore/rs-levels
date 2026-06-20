# TradingView

Display-only Pine indicator for RS Levels.

TradingView Pine scripts cannot poll the local API directly. The RS Levels workflow is copy/paste:

1. Run the local service.
2. Capture RocketScooter levels with the browser extension or another approved local capture client.
3. Open `http://127.0.0.1:8765/tradingview/MES` or `http://127.0.0.1:8765/tradingview/MNQ`.
4. Copy the compact `RSLEVELS|...` payload.
5. Add `rs-levels.pine` to a TradingView chart and paste the payload into the indicator input.

JSON export is also available for tooling and manual inspection:

```text
http://127.0.0.1:8765/tradingview/MES?format=json
```

## Safety Boundary

This indicator only draws lines and labels. It does not contain strategy logic, alerts, order placement, broker connectivity, account reads, PnL reads, or automation.

## Indicator Controls

- `RS Levels Payload`: compact `RSLEVELS|...` text from the extension or local API.
- `Labels`: show or hide level labels.
- `Status`: show a small paste/status label on the latest bar.
- Kind toggles: DD bands, HP, MHP, open/close, references, zones, and unknown levels.
- `Line width`, `Label offset`, and `Line style`: display-only drawing preferences.

The status label shows the payload symbol, captured timestamp, and drawn/available row count. If the payload is missing or invalid, it prompts for a valid `RSLEVELS` payload instead of silently drawing nothing.

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

The local service sanitizes delimiters in level names so Pine can parse the payload with `str.split()`.

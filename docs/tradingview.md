# TradingView

TradingView support uses a manual paste workflow.

The official Pine documentation lists supported `request.*` data sources such as symbols, timeframes, financial/economic data, footprint data, and Pine Seeds from GitHub. Pine does not provide arbitrary HTTP access to `localhost`, so a TradingView indicator cannot poll the RS Levels local API directly.

References:

- https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/
- https://www.tradingview.com/pine-script-docs/writing/limitations/

## Recommended UX

- The browser extension popup should include `Copy TradingView Payload` for each symbol.
- The extension should only enable TradingView payload copy while the local service reports fresh captured levels.
- The local service exposes the same payload at `/tradingview/:symbol`.
- `Copy JSON` should remain available for users and external tools.
- The Pine indicator should parse the compact payload, not JSON.

## Local Service Exports

```text
GET /tradingview/MES
GET /tradingview/MNQ
GET /tradingview/F.US.EP...
GET /tradingview/F.US.ENQ...
GET /tradingview/MES?format=json
GET /tradingview/MNQ?format=json
```

The CQG-style RocketScooter paths normalize to the same ES/MES and NQ/MNQ families as `/levels/:symbol`; users do not need to paste the exact current contract code into TradingView.

Default response is text/plain:

```text
RSLEVELS|1|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp;DD Upper,7579.75,dd-band
```

The JSON response is for inspection and third-party tooling. It includes `compactPayload` with the exact Pine-ready string. Pine users should paste the compact `RSLEVELS|...` payload into the included indicator. The local API does not silently truncate the export; the included Pine indicator draws up to TradingView's drawing limit and reports drawn/available rows in its status label.

## Indicator

See `plugins/tradingview/rs-levels.pine`.

The indicator is display-only. It draws levels using the public kind field and does not include alerts, strategy logic, or execution behavior.

The included indicator provides kind visibility toggles, separate bull-zone and bear-zone controls, max-level display control, line style/width controls, optional labels, and an optional status label. The status label reports the payload symbol, captured timestamp, and drawn/available row count, or prompts for a valid `RSLEVELS` payload when the input is empty or malformed.

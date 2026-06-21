# TradingView

TradingView support uses a manual paste workflow.

The official Pine documentation lists supported `request.*` data sources such as symbols, timeframes, financial/economic data, footprint data, and Pine Seeds from GitHub. Pine does not provide arbitrary HTTP access to `localhost`, so a TradingView indicator cannot poll the RS Levels local API directly.

References:

- https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/
- https://www.tradingview.com/pine-script-docs/writing/limitations/

## Recommended UX

- The browser extension popup should include `Copy TradingView` for an all-symbol payload.
- The extension should only enable TradingView payload copy while the local service reports fresh captured levels.
- The Pine indicator should select the matching MES or MNQ section from the all-symbol payload based on the chart symbol.
- The local service exposes the same all-symbol payload at `/tradingview`.
- `Copy JSON` should remain available for users and external tools.
- The Pine indicator should parse the compact payload, not JSON.

## Local Service Exports

```text
GET /tradingview
GET /tradingview?format=json
GET /tradingview/MES
GET /tradingview/MNQ
GET /tradingview/F.US.EP...
GET /tradingview/F.US.ENQ...
GET /tradingview/MES?format=json
GET /tradingview/MNQ?format=json
```

The CQG-style RocketScooter paths normalize to the same ES/MES and NQ/MNQ families as `/levels/:symbol`; users do not need to paste the exact current contract code into TradingView.

Default all-symbol response is text/plain:

```text
RSLEVELS|2|2026-06-19T14:30:00.000Z|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp|MNQ|2026-06-19T14:29:59.500Z|BrZT1,30450.00,zone-bear
```

Single-symbol compatibility response is also text/plain:

```text
RSLEVELS|1|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp;DD Upper,7579.75,dd-band
```

The JSON response is for inspection and third-party tooling. It includes `compactPayload` with the exact Pine-ready string. Pine users should paste the compact `RSLEVELS|...` payload into the included indicator. The local API does not silently truncate the export; the included Pine indicator draws up to TradingView's drawing limits.

## Indicator

See `plugins/tradingview/rs-levels.pine`.

The indicator is display-only. It draws levels using the public kind field and does not include alerts, strategy logic, or execution behavior.

The included indicator accepts both v1 single-symbol payloads and v2 all-symbol payloads. For v2, it maps ES/MES charts to the `MES` section and NQ/MNQ charts to the `MNQ` section. The all-symbol export is futures-only; SPY, QQQ, and other watchlist/ETF symbols may be open in RocketScooter without being included in the TradingView payload. It provides kind visibility toggles, separate bull-zone and bear-zone controls, zone fills with adjustable opacity, max-level display control, line style/width controls, font-size control, optional labels, and label bar/vertical offsets. Level labels are placed a few ticks above or below the line, staggered into rows/columns, and cleaned so RocketScooter drawing metadata such as `horizontal`, `text`, and `Liquidity Map` does not clutter the chart. The pasted payload input is hidden from TradingView's status line so the compact `RSLEVELS|...` text does not clutter the chart header. Matching top/bottom zone rows such as `BZT1`/`BZB1`, `BrZT1`/`BrZB1`, or `Bull Zone Top`/`Bull Zone Bottom` are filled with a translucent version of the same bull or bear color.

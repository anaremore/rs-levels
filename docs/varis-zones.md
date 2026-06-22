# VARIS Zones

VARIS Zones is a VWAP-centered band overlay that uses RocketScooter risk interval (`RI`) as its distance input.

The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`. This repository provides display-only, local-first implementations that can read the captured `RI` value from RS Levels. It does not include trading strategy, alerts, broker connectivity, order entry, account reads, PnL reads, or automation.

## TradingView

TradingView Pine cannot poll localhost directly, so the VARIS TradingView workflow uses the same `Copy TradingView` payload as the RS Levels overlay:

1. Capture RocketScooter display data with the browser extension.
2. Click `Copy TradingView`.
3. Add `plugins/tradingview/varis-zones.pine` to a TradingView chart.
4. Paste the copied `RSLEVELS|2` text into `RS Levels Payload`.
5. Leave `Chart family` on `Auto`, or force `ES`/`NQ` if TradingView does not expose enough chart symbol context.

The script reads the `RI` stat row for the matching ES/MES or NQ/MNQ section. RS Levels prefers explicit `RI` captured from RocketScooter display data. If explicit `RI` is missing but DD bands are available, the TradingView exporter can include a derived display fallback from the outer DD-band pair. If no pasted `RI` is available, the script uses `Manual Risk Interval (Points)`.

## Bands

VARIS Zones draws:

- VWAP from the current 18:00 ET futures session reset.
- Upper/lower half-risk-interval bands at `VWAP +/- RI * 0.5`.
- Upper/lower full-risk-interval bands at `VWAP +/- RI`.
- Optional fills between VWAP and each band.

The default visual controls follow the original script shape: separate visibility toggles, line colors/widths, and fill colors/transparency for the VWAP and each band.

## Direct Platform Studies

Direct platform adapters include separate display-only VARIS sources:

- `plugins/sierra-chart/varis-zones-sierra.cpp`
- `plugins/ninjatrader/VARISZones.cs`
- `plugins/quantower/VARISZonesQuantower.cs`
- `plugins/bookmap/src/main/java/com/rslevels/bookmap/VARISZonesBookmap.java`

These variants read captured `RI` from the local API and compute VWAP from local chart bars. Sierra uses the combined `GET /sierra/:symbol` feed. NinjaTrader, Quantower, and Bookmap use `GET /stats/:symbol?format=rows` plus `GET /status`. Each direct-platform variant falls back to a manual risk interval when captured `RI` is unavailable.

Bookmap's public simplified API provides one-minute bars through its bar listener, so its VARIS source publishes the VWAP and risk bands as display-only indicators rather than filled chart regions. TradingView remains paste-based because Pine has no arbitrary localhost HTTP polling.

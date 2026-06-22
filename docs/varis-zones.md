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

The script reads the `RI` stat row for the matching ES/MES or NQ/MNQ section. If no pasted `RI` is available, it uses `Manual Risk Interval (Points)`.

## Bands

VARIS Zones draws:

- VWAP from the current 18:00 ET futures session reset.
- Upper/lower half-risk-interval bands at `VWAP +/- RI * 0.5`.
- Upper/lower full-risk-interval bands at `VWAP +/- RI`.
- Optional fills between VWAP and each band.

The default visual controls follow the original script shape: separate visibility toggles, line colors/widths, and fill colors/transparency for the VWAP and each band.

## Direct Platform Studies

Sierra Chart and NinjaTrader now include separate display-only VARIS sources:

- `plugins/sierra-chart/varis-zones-sierra.cpp`
- `plugins/ninjatrader/VARISZones.cs`

These variants read captured `RI` from the local API and compute VWAP from local chart bars. Sierra uses the combined `GET /sierra/:symbol` feed; NinjaTrader uses `GET /stats/:symbol?format=rows` plus `GET /status`.

Quantower and Bookmap VARIS variants are tracked separately because their chart APIs need platform-specific verification for bar VWAP and fill behavior. TradingView remains paste-based because Pine has no arbitrary localhost HTTP polling.

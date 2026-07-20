# VARIS Zones

VARIS Zones is a VWAP-centered band overlay that uses RocketScooter risk interval (`RI`) as its distance input.

The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`. This repository provides display-only, local-first implementations that can read the captured `RI` value from RS Levels. It does not include trading strategy, alerts, broker connectivity, order entry, account reads, PnL reads, or automation.

## TradingView

TradingView Pine cannot poll localhost directly, so the VARIS TradingView workflow uses the same `RSLEVELS|2` payload as the RS Levels overlay:

1. Capture RocketScooter display data with the browser extension.
2. Add `plugins/tradingview/varis-zones.pine` to a TradingView chart.
3. Click `Send to TradingView`; approve the exact site permission on first use and choose a target if several chart tabs are open.
4. Open VARIS settings within 45 seconds if needed, review the filled `RS Levels Payload`, and click `OK` yourself.
5. Leave `Chart family` on `Auto`, or force `ES`/`NQ` if TradingView does not expose enough chart symbol context.

`Copy payload instead` retains the manual copy/paste route.

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

These variants read captured `RI` from the local API and compute VWAP from local chart bars. Sierra VARIS uses `GET /sierra/:symbol`, matching the proven Sierra compatibility feed used by the RS Levels study; it reads only the `RI` stat row from that response. NinjaTrader, Quantower, and Bookmap VARIS use `GET /stats/:symbol?format=rows`; non-Sierra adapters also poll `GET /status` for source freshness. Sierra VARIS defaults to Auto symbol detection from the Sierra chart symbol. When explicit `RI` is not available but both DD bands are present, the local API can expose a display-derived RI equal to half the DD-band distance. Each direct-platform variant falls back to a manual risk interval when API RI is unavailable.

Bookmap's public simplified API provides one-minute bars through its bar listener, so its VARIS source publishes the VWAP and risk bands as display-only indicators rather than filled chart regions. TradingView remains payload-based because Pine has no arbitrary localhost HTTP polling; the extension can fill the visible payload setting, with manual paste as the fallback.

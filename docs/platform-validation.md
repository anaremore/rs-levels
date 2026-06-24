# Platform Validation

RS Levels ships source adapters for multiple charting platforms. CI can verify the public-safe source inventory, parser/exporter behavior, package contents, and static safety rules. Platform runtimes still need manual compile/install validation because Sierra Chart, NinjaTrader, Quantower, Bookmap, and TradingView run inside separate applications.

Use this checklist for every release candidate and whenever a plugin source changes.

## Evidence Rules

Validation notes must stay public-safe:

- Record platform name, platform version, operating system, RS Levels commit, local service URL, and pass/fail result.
- Use screenshots only when they show display overlays and scrubbed status. Do not include account, broker, position, PnL, order, or credential information.
- Do not include raw RocketScooter response URLs, cookies, headers, tokens, or private payload bodies.
- Record failures as reproducible setup steps plus scrubbed error text.

## Service Preflight

1. Run `npm test`, `npm run scan:private`, `npm run scan:secrets`, and `npm run package`.
2. Start the service with `npm start`.
3. For a synthetic smoke test, run `npm run demo:capture`.
4. Open `http://127.0.0.1:8765/status` and confirm `service.ok` is true.
5. Open `http://127.0.0.1:8765/plugins` and confirm every plugin entry is present.
6. Open these display feeds and confirm each returns data or an intentional waiting/stale state:

```text
http://127.0.0.1:8765/tradingview
http://127.0.0.1:8765/tradingview/ES
http://127.0.0.1:8765/sierra/ES
http://127.0.0.1:8765/levels/ES?format=rows
http://127.0.0.1:8765/stats/ES?format=rows
```

Repeat the single-symbol checks with `NQ` when NQ/MNQ data is available.

## Shared Display Criteria

Every RS Levels overlay must verify:

- ES data applies to ES and MES destination charts; NQ data applies to NQ and MNQ destination charts.
- Non-futures panels such as SPY and QQQ do not contaminate ES/NQ futures exports.
- DD bands, HP, MHP, open/close, references, yellow lines, red lines, CAT lines, bull zones, bear zones, and other finite-price levels render with distinct kind-aware styling where the platform supports it.
- Multiple yellow-line and red-line rows at different prices render as separate levels.
- Labels can be hidden when the platform exposes a label option.
- Waiting, offline, and stale states do not look live.
- No plugin asks for account, trade, order, position, PnL, broker, or credential access.

Every VARIS Zones adapter must verify:

- Captured or display-derived `RI` is read from the RS Levels stats feed or pasted TradingView payload.
- Manual risk interval fallback works when no captured `RI` is present.
- VWAP resets on the configured 18:00 ET futures session boundary.
- Half-risk and full-risk bands are drawn around VWAP.
- The VARIS Zones concept credit for RocketScooter community member `IAmTheLiquidity2` remains visible in docs or source comments.

## Platform Matrix

| Platform | Artifact | Input path | Required validation |
| --- | --- | --- | --- |
| TradingView | `plugins/tradingview/rs-levels.pine` | `RSLEVELS|2` paste payload | Paste all-symbol payload, verify Auto family selection on ES/MES and NQ/MNQ charts, verify manual lines and stats panel. |
| TradingView | `plugins/tradingview/varis-zones.pine` | `RSLEVELS|2` paste payload | Paste same payload, verify `RI` selection, manual fallback, VWAP, half-RI bands, and full-RI bands. |
| Sierra Chart | `plugins/sierra-chart/rs-levels-sierra.cpp` | `GET /sierra/:symbol` | Build ACSIL DLL, add study, verify levels, labels, stats marker, zone fills, stale/offline marker, and hidden debug default. |
| Sierra Chart | `plugins/sierra-chart/varis-zones-sierra.cpp` | `GET /sierra/:symbol` | Build ACSIL DLL, add study, verify the status build tag changed, `Follow chart symbol` is on, Auto symbol detection works on ES/MES and NQ/MNQ charts, `API RI` status comes from the Sierra compatibility feed, manual fallback works before RI is available, and VWAP/RI bands render. |
| NinjaTrader | `plugins/ninjatrader/RSLevelsDisplay.cs` | `GET /levels/:symbol?format=rows`, `GET /stats/:symbol?format=rows` | Compile NinjaScript, add indicator, verify levels, stats, zone fills, label controls, and stale/offline state. |
| NinjaTrader | `plugins/ninjatrader/VARISZones.cs` | `GET /stats/:symbol?format=rows` | Compile NinjaScript, add indicator, verify captured `RI`, manual fallback, VWAP, and RI bands. |
| Quantower | `plugins/quantower/RSLevelsDisplayQuantower.cs` | `GET /levels/:symbol?format=rows`, `GET /stats/:symbol?format=rows` | Build `plugins/quantower/RSLevels.csproj`, import/add indicator, verify levels, stats, zone fills, label controls, and stale/offline state. |
| Quantower | `plugins/quantower/VARISZonesQuantower.cs` | `GET /stats/:symbol?format=rows` | Build the same `plugins/quantower/RSLevels.csproj`, add indicator beside RS Levels, verify captured `RI`, manual fallback, VWAP, RI bands, and non-overlapping status panels. |
| Bookmap | `plugins/bookmap/src/main/java/com/rslevels/bookmap/RSLevelsDisplayBookmap.java` | `GET /levels/:symbol?format=rows`, `GET /stats/:symbol?format=rows` | Build add-on, attach to instrument, verify colored value lines, manual lines, and stale clearing behavior. |
| Bookmap | `plugins/bookmap/src/main/java/com/rslevels/bookmap/VARISZonesBookmap.java` | `GET /stats/:symbol?format=rows` | Build add-on, attach to instrument, verify captured `RI`, manual fallback, VWAP indicator, and RI band indicators. |

## Live RocketScooter Field Check

When the market is open and RocketScooter exposes live display context:

1. Load current ES/MES and NQ/MNQ futures charts in RocketScooter.
2. Keep SPY/QQQ or other non-futures panels open if that is part of the user's normal layout.
3. Reload the extension, reconnect the tab, and refresh RocketScooter.
4. Confirm the popup defaults to `ES + NQ` when both futures families are captured.
5. Confirm `Copy TradingView` includes all visible futures levels, manual yellow/red/CAT lines, bull/bear zones, and `DD`, `RI`, `Res`, `MRes`, `WRes`, and `Map` stats when RocketScooter exposes them.
6. Confirm direct plugin feeds show the same display rows through `/sierra/:symbol`, `/levels/:symbol?format=rows`, and `/stats/:symbol?format=rows`.

Any parser change made from a live field finding must add or update a synthetic fixture/test before release.

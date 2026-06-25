# Platform Plugins

Plugins in this repository are display-only. They read the local levels API or accept a manual export and draw overlays inside charting platforms.

If you are deciding which workflow to use, start with [Getting started](getting-started.md). If you need the service-backed setup steps first, use [Local API and extension setup](user-setup.md). Adapter authors should start with the shared [display plugin contract](plugin-contract.md), then use the platform-specific README for implementation details.

## Safety Boundary

Plugins must not:

- place orders
- modify orders
- cancel orders
- flatten positions
- read account balances
- read positions
- read PnL

Plugins may:

- poll the local API
- consume a manual paste/export payload
- draw horizontal level lines
- draw labels and zone fills
- show feed freshness
- show display-only stats such as DD, RI, Res, MRes, WRes, and liquidity-map code

## Plugin Paths

```text
plugins/
  manifest.json
  sierra-chart/
  ninjatrader/
  quantower/
  bookmap/
  tradingview/
```

`plugins/manifest.json` is the public inventory of display adapters included in the release package. It lists each adapter entry file, README, platform, integration mode, and read-only local API endpoints. The local API also serves this manifest at `GET /plugins`.

Sierra Chart, NinjaTrader, Quantower, and Bookmap can consume the local API directly when their platform runtime allows local HTTP polling. Sierra Chart includes display-only ACSIL source files at `plugins/sierra-chart/rs-levels-sierra.cpp` and `plugins/sierra-chart/varis-zones-sierra.cpp`. NinjaTrader includes display-only NinjaScript indicators at `plugins/ninjatrader/RSLevelsDisplay.cs` and `plugins/ninjatrader/VARISZones.cs`. Quantower includes display-only indicators at `plugins/quantower/RSLevelsDisplayQuantower.cs` and `plugins/quantower/VARISZonesQuantower.cs`, plus `plugins/quantower/RSLevels.csproj` so both Quantower indicators can build into one shared DLL. Bookmap includes display-only Java add-on source files at `plugins/bookmap/src/main/java/com/rslevels/bookmap/RSLevelsDisplayBookmap.java` and `plugins/bookmap/src/main/java/com/rslevels/bookmap/VARISZonesBookmap.java`.

The direct-polling adapters consume read-only symbol level feeds. Sierra Chart uses `GET /sierra/:symbol`, a compact text feed that combines source state, levels, and stats in one response because ACSIL studies are more reliable with a single plain-text poll. NinjaTrader, Quantower, and Bookmap consume the generic display row `name,price,red,green,blue,kind` text feed at `GET /levels/:symbol?format=rows`. Adapters use the level `kind` for category-aware colors, including user-added yellow, red, and CAT manual lines. Sierra Chart, NinjaTrader, and Quantower also offset labels away from the level line and fill matched zone top/bottom pairs when their chart drawing APIs support it. Bookmap maps kinds into distinct value-line color slots.

Direct adapters draw what the local API captured from RocketScooter. They do not synthesize overnight HP/MHP, yellow lines, red lines, or CAT lines. Users who want those optional levels in Sierra Chart, NinjaTrader, Quantower, Bookmap, or TradingView must add or keep them visible on the matching RocketScooter futures chart first, then let the extension/API capture a fresh snapshot.

Direct adapters also consume display context such as `DD`, `RI`, `Res`, `MRes`, `WRes`, and `Map BLD`. Sierra studies receive those values inside `/sierra/:symbol`; Sierra VARIS reads only the `RI` stat row from that same Sierra compatibility feed. NinjaTrader, Quantower, and Bookmap VARIS adapters use `GET /stats/:symbol?format=rows`. These values are display-only context from RocketScooter and are not interpreted as trading signals by this repository. Separate VARIS-style adapters use `RI` as a band-distance input while keeping it separate from the horizontal level overlay. The Sierra Chart VARIS study defaults to Auto symbol detection from the chart symbol, so ES/MES and NQ/MNQ charts can select the matching family without manual input. The Sierra Chart, NinjaTrader, Quantower, and Bookmap VARIS variants compute VWAP from local chart bars and fall back to a manual risk interval when captured `RI` is unavailable. The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`; this repository's adapters are public-safe display implementations.

TradingView Pine scripts run inside TradingView's Pine environment. The official Pine documentation lists `request.*` data sources such as other symbols, financial/economic data, footprint data, and Pine Seeds via GitHub; it does not provide arbitrary HTTP calls to localhost. The first TradingView path is therefore:

- a display-only Pine indicator checked into `plugins/tradingview/`
- the implemented `/tradingview` local-service endpoint and extension button to copy an all-symbol `RSLEVELS|2` payload
- the implemented `/tradingview/:symbol` export for selected-symbol users and tooling
- an indicator input where the short payload can be pasted and drawn
- a stats panel fed by `stat` rows inside the same short payload
- a separate VARIS Zones Pine indicator that reads `RI` from the same payload; the VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`

References:

- https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/
- https://www.tradingview.com/pine-script-docs/writing/limitations/

## Feed Freshness

Every plugin should show stale/missing data clearly. A chart should never make an old capture look live.

# Platform Plugins

Plugins in this repository are display-only. They read the local levels API or accept a manual export and draw overlays inside charting platforms.

Start with the shared [display plugin contract](plugin-contract.md), then use the platform-specific README for implementation details.

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
- show display-only stats such as DD, Res, MRes, WRes, and liquidity-map code

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

Sierra Chart, NinjaTrader, Quantower, and Bookmap can consume the local API directly when their platform runtime allows local HTTP polling. Sierra Chart includes a display-only ACSIL source file at `plugins/sierra-chart/rs-levels-sierra.cpp`, NinjaTrader includes a display-only NinjaScript indicator at `plugins/ninjatrader/RSLevelsDisplay.cs`, Quantower includes a display-only indicator at `plugins/quantower/RSLevelsDisplayQuantower.cs`, and Bookmap includes a display-only Java add-on source file at `plugins/bookmap/src/main/java/com/rslevels/bookmap/RSLevelsDisplayBookmap.java`.

The direct-polling adapters consume the generic display row `name,price,red,green,blue,kind` text feed at `GET /levels/:symbol?format=rows`. Sierra Chart uses the equivalent query-free `GET /levels/:symbol/rows` compatibility path. Adapters use the `kind` column for category-aware colors, including user-added yellow, red, and CAT manual lines. Sierra Chart, NinjaTrader, and Quantower also offset labels away from the level line and fill matched zone top/bottom pairs when their chart drawing APIs support it. Bookmap maps kinds into distinct value-line color slots.

Direct adapters also consume `GET /stats/:symbol?format=rows` or the Sierra-compatible `GET /stats/:symbol/rows` for chart-corner display context such as `DD`, `Res`, `MRes`, `WRes`, and `Map BLD`. These rows are display-only context from RocketScooter and are not interpreted as trading signals by this repository.

TradingView Pine scripts run inside TradingView's Pine environment. The official Pine documentation lists `request.*` data sources such as other symbols, financial/economic data, footprint data, and Pine Seeds via GitHub; it does not provide arbitrary HTTP calls to localhost. The first TradingView path is therefore:

- a display-only Pine indicator checked into `plugins/tradingview/`
- the implemented `/tradingview` local-service endpoint and extension button to copy an all-symbol `RSLEVELS|2` payload
- the implemented `/tradingview/:symbol` export for selected-symbol users and tooling
- an indicator input where the short payload can be pasted and drawn
- a stats panel fed by `stat` rows inside the same short payload

References:

- https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/
- https://www.tradingview.com/pine-script-docs/writing/limitations/

## Feed Freshness

Every plugin should show stale/missing data clearly. A chart should never make an old capture look live.

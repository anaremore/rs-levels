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

## Plugin Paths

```text
plugins/
  sierra-chart/
  ninjatrader/
  quantower/
  bookmap/
  tradingview/
```

Sierra Chart, NinjaTrader, Quantower, and Bookmap can consume the local API directly when their platform runtime allows local HTTP polling. Sierra Chart includes an initial display-only ACSIL source file at `plugins/sierra-chart/rs-levels-sierra.cpp`, NinjaTrader includes an initial display-only NinjaScript indicator at `plugins/ninjatrader/RSLevelsDisplay.cs`, and Quantower includes an initial display-only indicator at `plugins/quantower/RSLevelsDisplayQuantower.cs`. Bookmap currently contains an implementation-ready specification.

TradingView Pine scripts run inside TradingView's Pine environment. The official Pine documentation lists `request.*` data sources such as other symbols, financial/economic data, footprint data, and Pine Seeds via GitHub; it does not provide arbitrary HTTP calls to localhost. The first TradingView path is therefore:

- a display-only Pine indicator checked into `plugins/tradingview/`
- the implemented `/tradingview/:symbol` local-service endpoint and extension button to copy a compact level payload
- the implemented `/tradingview/:symbol?format=json` export for users and tooling
- an indicator input where the compact payload can be pasted and drawn

References:

- https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/
- https://www.tradingview.com/pine-script-docs/writing/limitations/

## Feed Freshness

Every plugin should show stale/missing data clearly. A chart should never make an old capture look live.

# Platform Plugins

Plugins in this repository are display-only. They read the local levels API and draw overlays inside charting platforms.

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
- draw horizontal level lines
- draw labels and zone fills
- show feed freshness

## Planned Plugins

```text
plugins/
  sierra-chart/
  ninjatrader/
  quantower/
  bookmap/
```

Each plugin should have its own README with installation steps and a short display-only safety statement.


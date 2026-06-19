# RS Levels

Local-first RocketScooter level capture and display feeds.

RS Levels lets a user capture level data from their own RocketScooter browser session, normalize it locally, and expose it through localhost APIs for display tools and charting-platform plugins.

## What This Is

- A browser extension for allowlisted RocketScooter response capture.
- A local API service that stores the latest level snapshot.
- Stable JSON and streaming APIs for display integrations.
- Display-only plugins for charting platforms.

## What This Is Not

- No trading strategy.
- No trade recommendations.
- No order entry, cancel, flatten, or broker execution.
- No account, PnL, batch, or trade-journal features.
- No redistribution of RocketScooter data.

Users must have their own RocketScooter access. This project only processes data already loaded in the user's browser and keeps it local by default.

## Planned Layout

```text
apps/
  browser-extension/
  local-service/
packages/
  schemas/
  core-parser/
plugins/
  sierra-chart/
  ninjatrader/
  quantower/
  bookmap/
examples/
  html-dashboard/
  node-client/
  python-client/
docs/
```

## Status

Planning skeleton only. Code extraction will happen in small public-safety-reviewed steps.

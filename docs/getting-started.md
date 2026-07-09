# Getting Started

Use this page to choose the shortest path for what you want to do.

## Start Here

| Goal | Best first doc | What you need |
| --- | --- | --- |
| Show RocketScooter levels on TradingView | [TradingView quickstart](tradingview-quickstart.md) | Browser extension and the `RS Levels` Pine indicator. |
| Show VARIS Zones on TradingView | [TradingView quickstart](tradingview-quickstart.md), then [VARIS Zones](varis-zones.md) | Same copied payload, plus the `VARIS Zones` Pine indicator. |
| Use Sierra Chart, NinjaTrader, Quantower, or Bookmap | [Local API and extension setup](user-setup.md), then [Platform plugins](platform-plugins.md) | Local API, browser extension, and the platform-specific source file. |
| Explore the local API or build a display client | [Local API and extension setup](user-setup.md), then [API](api.md) | Local API and either live capture or the demo capture. |
| Use another machine over Tailscale or a trusted LAN | [Networking](networking.md) | Explicit remote binding and a trusted private address. |
| Build or verify a release package | [Packaging](packaging.md) | `npm run package` and release checks. |
| Understand the public safety boundary | [Public boundary](public-boundary.md) and [Privacy and security](privacy-security.md) | The rules for display-only, public-safe work. |

## Rules Of Thumb

- RS Levels is display-only. It does not place orders, manage positions, read account data, or provide trading strategy.
- The browser extension captures display data from RocketScooter pages the user already has open.
- TradingView cannot poll localhost from Pine, so TradingView uses a copied `RSLEVELS|2` payload.
- Sierra Chart, NinjaTrader, Quantower, and Bookmap can use the local API when their platform runtime allows local HTTP polling.
- ES-family captures apply to ES and MES charts. NQ-family captures apply to NQ and MNQ charts.
- Optional manual RocketScooter levels are source-owned. Add overnight HP/MHP, yellow lines, red lines, and CAT lines in RocketScooter first if you want them to appear in downstream indicators, studies, or plugins.
- Keep the service on `http://127.0.0.1:8765` unless you intentionally expose it to a trusted private network.

## Common Workflows

### TradingView Levels Only

1. Load the browser extension.
2. Open RocketScooter with the futures or stock charts you want to copy visible.
3. Add optional manual RocketScooter lines you want exported.
4. Add `plugins/tradingview/rs-levels.pine` to TradingView.
5. Click `Copy TradingView` in the extension popup.
6. Paste into the indicator's `RS Levels Payload` input.

See [TradingView quickstart](tradingview-quickstart.md).

### TradingView Levels Plus VARIS Zones

1. Complete the TradingView levels workflow.
2. Add `plugins/tradingview/varis-zones.pine` to the same chart.
3. Paste the same `RSLEVELS|2` payload into the VARIS indicator.
4. Confirm the indicator is using the expected chart family and `RI`.

See [VARIS Zones](varis-zones.md).

### Direct Platform Plugins

1. Start the local API with `npm start`.
2. Load the browser extension and capture RocketScooter levels.
3. Install or compile the platform source file from `plugins/`.
4. Point the plugin at `http://127.0.0.1:8765`.
5. Use the platform README for platform-specific settings and validation.

See [Platform plugins](platform-plugins.md).

### API Exploration

1. Start the local API with `npm start`.
2. Use `npm run demo:capture` if live RocketScooter capture is not available.
3. Open `http://127.0.0.1:8765/docs`.
4. Use [API](api.md), [Schema reference](schema-reference.md), and the examples under `examples/`.

## Troubleshooting Shortcuts

- Extension stuck waiting: open RocketScooter, click `Reconnect Tab`, then reload or refresh the RocketScooter tab.
- TradingView shows no levels: copy a fresh payload, confirm the stock ticker or futures family matches a detected RocketScooter chart, and leave `Chart family` on `Auto` for stocks. Force `ES` or `NQ` only for futures when needed.
- Manual lines missing: add them in RocketScooter first, then capture/copy again.
- Direct plugin has no data: verify `http://127.0.0.1:8765/health`, then inspect `http://127.0.0.1:8765/status`.
- Support bundle: use `Copy Diagnostics` in the extension popup.

## Detailed References

- [Browser extension](browser-extension.md)
- [TradingView](tradingview.md)
- [Platform plugins](platform-plugins.md)
- [Display plugin contract](plugin-contract.md)
- [API](api.md)
- [OpenAPI spec](openapi.yaml)
- [Schemas overview](schemas.md)
- [Schema reference](schema-reference.md)
- [Architecture](architecture.md)
- [Platform validation](platform-validation.md)

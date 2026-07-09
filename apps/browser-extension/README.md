# Browser Extension

For help choosing a workflow, see [Getting started](../../docs/getting-started.md). For the shortest TradingView-only workflow, see [TradingView quickstart](../../docs/tradingview-quickstart.md). For the full local API workflow, see [User setup](../../docs/user-setup.md).

Manifest V3 extension for allowlisted RocketScooter response capture and display-only chart-level/context reading.

The extension runs only on RocketScooter app host patterns (`rocket.place` and `rocketscooter.com`), injects a page hook at `document_start`, observes fetch/XHR responses, and forwards only URL-allowlisted response bodies to the local RS Levels service. It also injects a frame-aware display-only page reader that polls the TradingView chart objects currently open in RocketScooter. Futures keep their existing levels and context; stock charts can export detected HP, MHP, and liquidity-map data.

The page hook skips clearly non-text response content types before reading a body. Empty content types are allowed because some browser API responses omit the header.

## Load Unpacked

1. Open Chromium extension management.
2. Enable developer mode.
3. Load `apps/browser-extension` as an unpacked extension.
4. Start the local service with `npm start`.
5. Open RocketScooter and use the extension popup to check status.

Packaged releases also include `dist/rs-levels-browser-extension-0.2.0.zip`. Unzip it and load the extracted folder as the unpacked extension. The standalone zip contains only the extension manifest, README, and runtime `src/` files.

## Popup

The popup shows local service health, service version, extension version/build identity, captured display-data state, export actions, and the last extension-side issue. It includes:

- detected-chart selector
- capture pause/resume toggle
- `Copy TradingView`
- `Reconnect Tab`
- `Copy Diagnostics`
- `API Docs`
- `Plugins`
- options shortcut
- collapsed debug section with aggregate observed, ignored, skipped, posted counters, hook status reason, and manual status refresh

The capture toggle updates the same `captureEnabled` setting as the options page. The selector contains only symbols with supported data in RocketScooter charts that are currently open; it does not copy the platform watchlist into a long dropdown. When several charts are available, `All detected charts` bundles them in one payload. `Copy TradingView` uses the extension's latest page-reader capture first, including stock HP/MHP and liquidity-map context. ES/NQ can still fall back to the local `/tradingview/:symbol` endpoint. The copied `RSLEVELS|2` payload can be pasted directly into the TradingView indicator. `Reconnect Tab` attaches the capture hook to the active RocketScooter tab if the extension was loaded after the page was already open. `Copy Diagnostics` copies a scrubbed support bundle from `/diagnostics` plus extension post timing. `API Docs` opens the local `/docs` page, and `Plugins` opens `/plugins`.

If the local service is offline, `Copy TradingView` still works from the extension's latest page-reader capture. Refresh RocketScooter after opening, closing, or changing a chart so the detected selector and payload are fresh.

Capture is not limited by the selected popup export. The extension posts every allowlisted response it observes, while popup choices come only from the page reader's open-chart snapshot. Futures payload sections use `ES` and `NQ`; stock sections use their ticker, such as `NVDA`.

The page-reader fallback posts a synthetic `/page-reader/display` capture through the same local ingest endpoint. It emits generic display levels plus compatibility arrays named `chartLines`, `referenceLines`, and `zoneRectangles`. It runs in RocketScooter child frames as well as the top page so embedded chart objects are visible. Futures retain DD, RI, Res, MRes, WRes, zones, references, and manual-line behavior. For a detected stock chart, the reader can export visible HP/MHP lines and the matching liquidity-map code without iterating the rest of the watchlist. It emits only chart symbols, display names, prices, public kind labels, colors, display stats, and small diagnostic metadata; it does not forward account, broker, execution, order-entry, raw DOM text, cookies, headers, or credentials.

If the popup remains waiting, `Hook: hook-installed` or `Hook: settings-synced` means the page hook is alive and waiting for RocketScooter traffic. `Observed: 0` means the hook has not seen fetch/XHR responses yet; use `Reconnect Tab`, then reload RocketScooter data or the tab so startup requests run with the hook installed.

## Options

Options let users configure:

- local service URL, default `http://127.0.0.1:8765`
- capture enabled/paused
- endpoint URL allowlist
- max capture size
- service reachability test
- Chrome origin permission status for the configured service URL

Older unpacked extension settings migrate to the current display-feed allowlist after reload or update.

For Tailscale/private-network use, point the service URL at the trusted machine after the local service has been explicitly started with remote access enabled. Chrome will ask for permission to reach that specific origin.

## Safety Boundary

The extension does not store credentials, forward request auth data, read arbitrary page text, or include strategy/execution behavior. It forwards response bodies only when their URL matches the configured allowlist. The page-reader fallback reads only TradingView chart object metadata needed for display levels and display stats. Capture diagnostics are aggregate counters and scrubbed reasons; they do not include ignored URLs, headers, cookies, bodies, or page text.

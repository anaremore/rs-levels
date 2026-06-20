# Browser Extension

For the full user workflow, see docs/user-setup.md.

Manifest V3 extension for allowlisted RocketScooter response capture.

The extension runs only on RocketScooter app host patterns (`rocket.place` and `rocketscooter.com`), injects a page hook at `document_start`, observes fetch/XHR responses, and forwards only URL-allowlisted response bodies to the local RS Levels service.

The page hook skips clearly non-text response content types before reading a body. Empty content types are allowed because some browser API responses omit the header.

## Load Unpacked

1. Open Chromium extension management.
2. Enable developer mode.
3. Load `apps/browser-extension` as an unpacked extension.
4. Start the local service with `npm start`.
5. Open RocketScooter and use the extension popup to check status.

Packaged releases also include `dist/rs-levels-browser-extension-0.1.0.zip`. Unzip it and load the extracted folder as the unpacked extension. The standalone zip contains only the extension manifest, README, and runtime `src/` files.

## Popup

The popup shows local service health, service version, extension version/build identity, captured level counts, export actions, and the last extension-side issue. It includes:

- symbol selector
- capture pause/resume toggle
- `Copy TradingView`
- `Copy JSON`
- `Reconnect Tab`
- `Copy Diagnostics`
- `API Docs`
- `Plugins`
- options shortcut
- collapsed debug section with aggregate observed, ignored, skipped, posted counters, hook status reason, and manual status refresh

The capture toggle updates the same `captureEnabled` setting as the options page. `Copy TradingView` reads the all-symbol `/tradingview` payload from the local service. `Copy JSON` reads `/tradingview/:symbol?format=json` for the selected symbol. `Reconnect Tab` attaches the capture hook to the active RocketScooter tab if the extension was loaded after the page was already open. `Copy Diagnostics` copies a scrubbed support bundle from `/diagnostics` plus extension post timing. `API Docs` opens the local `/docs` page, and `Plugins` opens `/plugins`.

`Copy TradingView` is disabled while the local service is waiting for levels or reporting a stale source. Refresh RocketScooter to capture fresh levels before copying a Pine paste payload. `Copy JSON` remains available for inspection and tooling.

Capture is not limited by the selected popup symbol. The extension posts every allowlisted response it observes, and the local parser can store both MES and MNQ from one combined response. The symbol selector controls selected-symbol JSON export; the TradingView payload can carry all captured symbols.

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

The extension does not store credentials, forward request auth data, read arbitrary page text, or include strategy/execution behavior. It forwards response bodies only when their URL matches the configured allowlist. Capture-hook diagnostics are aggregate counters and scrubbed reasons; they do not include ignored URLs, headers, cookies, bodies, or page text.

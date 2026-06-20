# Browser Extension

For the full user workflow, see docs/user-setup.md.

Manifest V3 extension for allowlisted RocketScooter response capture.

The extension runs only on `rocketscooter.com` host patterns, injects a page hook at `document_start`, observes fetch/XHR responses, and forwards only URL-allowlisted response bodies to the local RS Levels service.

The page hook skips clearly non-text response content types before reading a body. Empty content types are allowed because some browser API responses omit the header.

## Load Unpacked

1. Open Chromium extension management.
2. Enable developer mode.
3. Load `apps/browser-extension` as an unpacked extension.
4. Start the local service with `npm start`.
5. Open RocketScooter and use the extension popup to check status.

Packaged releases also include `dist/rs-levels-browser-extension-0.1.0.zip`. Unzip it and load the extracted folder as the unpacked extension. The standalone zip contains only the extension manifest, README, and runtime `src/` files.

## Popup

The popup shows local service health, service version, captured level counts, post timing, capture-hook counters, and the last extension-side issue. It includes:

- symbol selector
- capture pause/resume toggle
- `Copy TradingView`
- `Copy JSON`
- `Copy Diagnostics`
- `API Docs`
- `Plugins`
- aggregate observed, ignored, skipped, and posted counters
- refresh
- options shortcut

The capture toggle updates the same `captureEnabled` setting as the options page. `Copy TradingView` reads `/tradingview/:symbol` from the local service. `Copy JSON` reads `/tradingview/:symbol?format=json`. `Copy Diagnostics` copies a scrubbed support bundle from `/diagnostics` plus extension post timing. `API Docs` opens the local `/docs` page, and `Plugins` opens `/plugins`, without adding extension permissions.

`Copy TradingView` is disabled while the local service is waiting for levels or reporting a stale source. Refresh RocketScooter to capture fresh levels before copying a Pine paste payload. `Copy JSON` remains available for inspection and tooling.

## Options

Options let users configure:

- local service URL, default `http://127.0.0.1:8765`
- capture enabled/paused
- endpoint URL allowlist
- max capture size
- service reachability test
- Chrome origin permission status for the configured service URL

For Tailscale/private-network use, point the service URL at the trusted machine after the local service has been explicitly started with remote access enabled. Chrome will ask for permission to reach that specific origin.

## Safety Boundary

The extension does not store credentials, forward request auth data, read arbitrary page text, or include strategy/execution behavior. It forwards response bodies only when their URL matches the configured allowlist. Capture-hook diagnostics are aggregate counters and scrubbed reasons; they do not include ignored URLs, headers, cookies, bodies, or page text.

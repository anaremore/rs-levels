# User Setup

This guide is for users who want the local API, browser extension, and TradingView paste workflow.

## Requirements

- Node.js 20 or newer
- A Chromium-based browser for the extension
- Your own RocketScooter browser access
- TradingView, if you want to use the Pine indicator

## 1. Start The Local API

```powershell
git clone git@github.com:anaremore/rs-levels.git
cd rs-levels
npm test
npm start
```

Default API URL:

```text
http://127.0.0.1:8765
```

Health check:

```powershell
curl http://127.0.0.1:8765/health
```

The OpenAPI spec is in [openapi.yaml](openapi.yaml). It can be opened with Swagger UI, Redoc, or any OpenAPI-compatible client tooling.

## Packaged Release

Maintainers can create a clean release directory with:

```powershell
npm run package
```

Users can then run the service from the package root and load the unpacked extension from `dist/rs-levels-0.0.0/apps/browser-extension`.
## 2. Load The Browser Extension

1. Open `chrome://extensions` or the equivalent Chromium extension page.
2. Enable developer mode.
3. Choose `Load unpacked`.
4. Select `apps/browser-extension` from this repository.
5. Pin `RS Levels Capture` if you want quick access to the popup.

The extension runs only on RocketScooter host patterns. It posts allowlisted response bodies to your configured local API URL.

## 3. Capture Levels

1. Start the local API.
2. Open RocketScooter in the browser with the extension loaded.
3. Open the extension popup.
4. Confirm the service status changes from waiting/offline to live once levels are captured.

If capture does not start, open extension options and review the endpoint allowlist.

## 4. Use TradingView

1. In TradingView, open Pine Editor.
2. Paste the contents of `plugins/tradingview/rs-levels.pine`.
3. Add the indicator to your chart.
4. In the extension popup, choose the symbol and click `Copy TradingView`.
5. Paste the copied `RSLEVELS|...` payload into the indicator input.

`Copy JSON` is available for manual inspection and third-party tooling.

## 5. Tailscale Or Trusted Private Network

Loopback is safest. For a second machine over Tailscale or another trusted private network:

Start the API with remote access explicitly enabled:

```powershell
$env:RS_LEVELS_HOST = "0.0.0.0"
$env:RS_LEVELS_ALLOW_REMOTE = "1"
npm start
```

Then open the extension options page and set the service URL to the trusted private address, for example:

```text
http://100.x.y.z:8765
```

Chrome will ask for permission to reach that specific origin. The extension does not auto-discover or broadcast service locations.

## Troubleshooting

- `OFFLINE` in the popup: start the API or check the service URL.
- No symbols in the popup: open RocketScooter and wait for allowlisted level responses.
- TradingView lines do not update: copy a fresh payload and paste it into the indicator input.
- Remote URL fails: confirm the API was started with `RS_LEVELS_ALLOW_REMOTE=1`, firewall rules allow the port, and Chrome granted the extension origin permission.
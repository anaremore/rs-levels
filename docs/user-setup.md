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

Local API docs:

```text
http://127.0.0.1:8765/docs
```

The OpenAPI/Swagger-compatible spec is served at `http://127.0.0.1:8765/openapi.yaml` and checked into [openapi.yaml](openapi.yaml). It can be opened with Swagger UI, Redoc, Postman, Insomnia, or other OpenAPI-compatible client tooling.

## Packaged Release

Maintainers can create a clean release directory with:

```powershell
npm run package
```

Users can then run the service from the package root and load the unpacked extension from `dist/rs-levels-0.0.0/apps/browser-extension`.

The package command also writes `dist/rs-levels-browser-extension-0.1.2.zip` and a checksum sidecar. Unzip that artifact and load the extracted folder if you want the focused extension package instead of the full source release.

Release packages include cross-platform service launch scripts:

```text
scripts/start-local-service.cmd
scripts/start-local-service.ps1
scripts/start-local-service.sh
```

## 2. Load The Browser Extension

1. Open `chrome://extensions` or the equivalent Chromium extension page.
2. Enable developer mode.
3. Choose `Load unpacked`.
4. Select `apps/browser-extension` from this repository, `dist/rs-levels-0.0.0/apps/browser-extension` from a source release, or the extracted `rs-levels-browser-extension` folder from the standalone extension zip.
5. Pin `RS Levels Capture` if you want quick access to the popup.

The extension runs only on RocketScooter host patterns. It posts allowlisted response bodies to your configured local API URL and reads display-only chart metadata from RocketScooter top-level and child-frame chart contexts.

## Demo Capture

Before RocketScooter capture is available, use the public-safe fixture to verify the API and examples:

```powershell
npm start
```

In another terminal:

```powershell
npm run demo:capture
```

Then open the dashboard, run a client example, copy a TradingView paste payload from `http://127.0.0.1:8765/tradingview`, or inspect diagnostics at `http://127.0.0.1:8765/diagnostics`.

The demo fixture includes sample DD/RI/Res/MRes/WRes and `Map BLD` context, so it is enough to verify both level rows, display stats, and VARIS-style RI consumers before RocketScooter capture is available.

## 3. Capture Levels

1. Start the local API.
2. Open RocketScooter in the browser with the extension loaded.
3. Open the extension popup.
4. Confirm capture is enabled in the popup.
5. If RocketScooter was already open before the extension loaded or reloaded, click `Reconnect Tab`.
6. Confirm the service status changes from waiting/offline to live once levels are captured.

You can keep the current ES and NQ futures contracts visible in RocketScooter. CQG-style symbols such as `F.US.EP...` are treated as the ES family, and `F.US.ENQ...` is treated as the NQ family, so the same captured levels can be used on ES/MES and NQ/MNQ charts in the destination platform.

When RocketScooter exposes DD ratio, RI, Res, MRes, WRes, or liquidity-map context such as `Map BLD`, RS Levels carries those values as display stats. TradingView shows them in its stats panel, VARIS Zones can use RI for band spacing, and direct platform plugins read them from `/stats/:symbol`.

If capture does not start, open extension options and review the endpoint allowlist.

## 4. Use TradingView

1. In TradingView, open Pine Editor.
2. Paste the contents of `plugins/tradingview/rs-levels.pine`.
3. Add the indicator to your chart.
4. In the extension popup, keep the export dropdown on `ES + NQ` and click `Copy TradingView`.
5. Paste the copied `RSLEVELS|2` text into the indicator's `RS Levels Payload` input, then click `OK`. One all-symbol payload can carry ES and NQ together; in `Auto`, the indicator detects ES/MES or NQ/MNQ from TradingView's chart symbol metadata. If TradingView does not expose enough symbol context, set `Chart family` to `ES` or `NQ`.

`Copy TradingView` first uses the extension's latest normalized display capture, so it can work without the local API when the RocketScooter page-reader has captured visible ES/NQ chart levels. If no extension-local payload is available, it falls back to the local `/tradingview` endpoint. Keep the local service running for API docs, diagnostics, examples, and direct platform plugins.

The same dropdown can copy only `ES` or only `NQ` payloads when you want a single-family export for inspection or third-party tooling. `Plugins` opens the local display-plugin manifest.

The same copied payload can also feed `plugins/tradingview/varis-zones.pine`. That indicator reads the `RI` stat row for the matching chart family and falls back to a manual risk interval input when no pasted RI is present. The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`; see [VARIS Zones](varis-zones.md).

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

Use `Test Service` in the options page to confirm Chrome permission and `/health` reachability for the configured private address.

## Use Examples

The `examples/` folder includes dependency-free clients for local API exploration:

- `examples/html-dashboard/index.html`
- `examples/node-client/snapshot.mjs`
- `examples/node-client/stream.mjs`
- `examples/python-client/snapshot.py`
- `examples/python-client/stream.py`

All examples default to `http://127.0.0.1:8765`. Set `RS_LEVELS_URL` or edit the dashboard API field for Tailscale/private-network URLs.

## Troubleshooting

- `OFFLINE` in the popup: start the API or check the service URL. Use `Copy Diagnostics` for a scrubbed setup bundle.
- No symbols in the popup: open RocketScooter and wait for allowlisted level responses. If `Observed` stays at 0 after RocketScooter data is visible, click `Reconnect Tab`, then reload the RocketScooter tab or refresh chart data so startup requests run with the hook installed. If `Hook` stays `none`, reload the extension and the RocketScooter tab. If `Observed` rises but `Ignored` also rises, review the endpoint allowlist in extension options. If `Skipped` rises, check max capture bytes or whether the endpoint returns empty/non-text responses.
- TradingView lines do not update: copy a fresh TradingView payload, paste it into the indicator's `RS Levels Payload` input, click `OK`, and force `Chart family` to `ES` or `NQ` if the chart still does not draw.
- Remote URL fails: confirm the API was started with `RS_LEVELS_ALLOW_REMOTE=1`, firewall rules allow the port, and `Test Service` succeeds in the extension options page.

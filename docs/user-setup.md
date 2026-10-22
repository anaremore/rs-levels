# Local API And Extension Setup

Use this guide when you want the local service, API docs, diagnostics, examples, direct platform plugins, or trusted private-network access. If you only want the shortest TradingView send-or-paste workflow, use [TradingView quickstart](tradingview-quickstart.md).

## Requirements

- Node.js 20 or newer
- Chrome/Chromium or Firefox Desktop 140+ for the extension; Firefox for Android is not currently supported
- Your own RocketScooter browser access
- TradingView or a supported platform plugin, depending on the display target

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

### Save Service Settings

To reuse service settings after a restart, copy the safe example to a stable location outside the repository or extracted release. On Windows, run this once from the checkout/package root:

```powershell
$configDir = Join-Path $env:APPDATA "RS Levels"
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
Copy-Item -LiteralPath "examples/local-service.config.example.json" -Destination (Join-Path $configDir "rs-levels.config.json")
notepad (Join-Path $configDir "rs-levels.config.json")
```

Keep this copy when upgrading; do not copy the example over your edited file. The example keeps localhost-only access with port `8765` and a 23-hour freshness threshold. Edit only the settings you need, save it, and launch with:

```powershell
npm start -- --config "$env:APPDATA\RS Levels\rs-levels.config.json"
```

Save that command in your usual startup shortcut or script. Direct CLI and wrapper commands accept the same argument:

```powershell
node apps/local-service/src/cli.js --config "$env:APPDATA\RS Levels\rs-levels.config.json"
scripts/start-local-service.ps1 --config "$env:APPDATA\RS Levels\rs-levels.config.json"
```

On macOS/Linux, copy the example to a private location such as `~/.config/rs-levels/rs-levels.config.json` and use `npm start -- --config "$HOME/.config/rs-levels/rs-levels.config.json"`. `--config=path` is also supported. Relative paths use the current working directory; wrappers first change to the package root, so absolute paths are easiest to reuse.

Restart with the same command after changing the file. The service reads it only at startup and does not discover config files automatically. Existing `npm start` and environment-only commands continue to work. For each setting, defaults are overridden by the saved file, then environment variables, then programmatic `options.config`. A defined blank environment variable resets that setting to its default; remove the variable if you want to inherit the file.

The file supports only `host`, `port`, `allowRemote`, `corsOrigins`, and `staleMs`. Missing/unreadable files, malformed JSON, unknown keys, and invalid values stop startup with a useful error. See the [configuration reference](../apps/local-service/README.md#configuration) for defaults, validation, CORS replacement rules, and safety details. Keep credentials and captures out of the file; the safe example needs neither. The conventional actual filename is ignored by Git and excluded from releases, but other private filenames must remain outside the checkout/package.

The browser extension already saves its own URL and capture options independently. Changing the service host or port does not update extension settings: set the matching service URL in extension options, grant permission for that origin if requested, and click `Test Service`. Update any direct plugin/client URL too.

## Packaged Release

Maintainers can create a clean release directory with:

```powershell
npm run package
```

Users can then run the service from the package root. Chrome/Chromium users can load the unpacked extension from `dist/rs-levels-0.0.0/apps/browser-extension`.

The package command also writes focused Chrome/Chromium and Firefox artifacts plus checksum sidecars:

```text
dist/rs-levels-browser-extension-<extension-version>.zip
dist/rs-levels-browser-extension-firefox-<extension-version>.zip
```

Release packages include cross-platform service launch scripts:

```text
scripts/start-local-service.cmd
scripts/start-local-service.ps1
scripts/start-local-service.sh
```

## 2. Load The Browser Extension

### Chrome Or Chromium

For Chrome, [install RS Levels Capture from the Chrome Web Store](https://chromewebstore.google.com/detail/rs-levels-capture/jgfonimhhihgemjnejboonidkgplkiko), then pin it for quick access to the popup.

For development builds or Chromium browsers that cannot use the store:

1. Open `chrome://extensions` or the equivalent Chromium extension page.
2. Enable developer mode.
3. Choose `Load unpacked`.
4. Select `apps/browser-extension` from this repository, `dist/rs-levels-0.0.0/apps/browser-extension` from a source release, or the extracted `rs-levels-browser-extension` folder from the standalone extension zip.
5. Pin `RS Levels Capture` if you want quick access to the popup.

### Firefox

1. Run `npm run package` and use Firefox Desktop 140 or newer.
2. Open `about:debugging`.
3. Choose `This Firefox`, then `Load Temporary Add-on`.
4. Select `dist/rs-levels-browser-extension-firefox-<extension-version>.zip`, or extract it and select its root `manifest.json`.
5. Pin `RS Levels Capture` if you want quick access to the popup.

This development install is removed when Firefox restarts. Permanent Firefox distribution requires an add-on signed by Mozilla.

Extension capture code runs only on RocketScooter host patterns. It posts allowlisted response bodies to your configured local API URL and reads display-only chart metadata from RocketScooter top-level and child-frame chart contexts. TradingView receives a one-shot helper only after an explicit send and exact site-permission grant.

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
4. Confirm the popup detects the supported RocketScooter charts you have open. Capture starts automatically on the declared RocketScooter hosts.
5. If RocketScooter was already open before the extension loaded or reloaded, click `Reconnect Tab`.
6. Confirm the service status changes from waiting/offline to live once levels are captured.

You can keep the current ES and NQ futures contracts visible in RocketScooter. CQG-style symbols such as `F.US.EP...` are treated as the ES family, and `F.US.ENQ...` is treated as the NQ family, so the same captured levels can be used on ES/MES and NQ/MNQ charts in the destination platform.

When RocketScooter exposes DD ratio, RI, Res, MRes, WRes, or liquidity-map context such as `Map BLD`, RS Levels carries those values as display stats. TradingView shows them in its stats panel, VARIS Zones can use RI for band spacing, and direct platform plugins read them from `/stats/:symbol`.

RocketScooter now supplies overnight levels automatically as `Dyn MHP` and `Dyn HP`. Keep those study lines visible on the relevant futures chart and RS Levels will preserve their names in TradingView, Sierra Chart, NinjaTrader, and Quantower. Existing manual `OVNMHP` and `OVNHP` lines remain supported, including multiple distinct prices; an exact duplicate label-and-price capture is shown once. Yellow, red, and CAT lines are still optional manual levels that must be present in RocketScooter. After changing the chart or a manual line, refresh/reconnect RocketScooter if needed and send, copy, or poll a fresh capture.

If capture does not start, open extension options and review the endpoint allowlist.

## 4. Use TradingView Payloads

The full TradingView walkthrough lives in [TradingView quickstart](tradingview-quickstart.md).

From this setup, the important detail is that `Send to TradingView` freezes one `RSLEVELS|2` payload containing the supported RocketScooter charts selected in the popup. On first use it asks for the exact TradingView site permission; with several chart tabs, it asks you to choose. It fills only a visible `RS Levels Payload` field and leaves `OK` to you. `Copy payload instead` preserves manual paste. In `Auto`, the RS Levels Pine indicator matches stocks by ticker and futures by ES/NQ family. The same indicator draws VARIS Zones from the matching futures `RI` stat row when it is present.

Both TradingView actions first use the extension's latest detected-chart capture, stored as a sanitized session-only snapshot, so stock and futures handoff can work without the local API. The popup lists only open charts with supported data, never the full watchlist. ES/NQ can fall back to the local `/tradingview/:symbol` endpoint. Keep the local service running for API docs, diagnostics, examples, and direct platform plugins.

## 5. Use Thinkorswim Generated Studies

ThinkScript cannot call the local API directly. Select one freshly detected chart in the extension popup and click `Copy Thinkorswim study`; the extension generates the source locally, so the service may be offline. In Thinkorswim, replace the source of a custom chart study with the copied source and save it. The generated study shows its frozen capture timestamp; repeat the copy-and-replace workflow after refreshing RocketScooter levels.

When the local service is running, an equivalent source remains available to direct tools at `GET /thinkorswim/:symbol`. See the [Thinkorswim adapter](../plugins/thinkorswim/README.md).

## 6. Tailscale Or Trusted Private Network

Loopback is safest. For a second machine over Tailscale or another trusted private network:

Start the API with remote access explicitly enabled:

```powershell
$env:RS_LEVELS_HOST = "0.0.0.0"
$env:RS_LEVELS_ALLOW_REMOTE = "1"
npm start
```

To save that choice, set `"host": "0.0.0.0"` and `"allowRemote": true` together in your JSON file and start with `--config` as above. Prefer a specific trusted private interface address when available. A non-loopback host without effective remote permission falls back to `127.0.0.1` with a warning; CORS changes alone never enable remote binding.

Then open the extension options page and set the service URL to the trusted private address, for example:

```text
http://100.x.y.z:8765
```

The browser will ask for permission to reach that specific origin. The extension does not auto-discover or broadcast service locations.

Use `Test Service` in the options page to confirm browser permission and `/health` reachability for the configured private address.

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
- TradingView lines do not update: send a fresh TradingView payload, open the settings within 45 seconds if needed, review `RS Levels Payload`, and click `OK`. Use `Copy payload instead` if assisted fill cannot find the field, and force `Chart family` to `ES` or `NQ` if the chart still does not draw.
- Saved settings do not apply: confirm startup uses the intended `--config` path, restart after editing, and check for environment variables overriding the file.
- Remote URL fails: confirm the effective host and remote permission in `/health`, firewall rules allow the port, and `Test Service` succeeds in the extension options page.

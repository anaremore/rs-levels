# Local Service

Cross-platform localhost API service for RS Levels.

For help choosing between TradingView copy/paste, direct platform plugins, API clients, and private-network use, see [Getting started](../../docs/getting-started.md).

The service receives browser-extension captures, normalizes display levels, keeps the latest snapshot in memory, and exposes read-only REST plus Server-Sent Events feeds for charting tools.

## Start

```powershell
npm start
```

Built-in docs: http://127.0.0.1:8765/docs.

OpenAPI spec: http://127.0.0.1:8765/openapi.yaml, also checked in at docs/openapi.yaml.

CLI smoke checks:

```powershell
node apps/local-service/src/cli.js --help
node apps/local-service/src/cli.js --version
```

Default URL:

```text
http://127.0.0.1:8765
```

The service is plain Node.js and is intended to run on Windows, macOS, and Linux.

## Configuration

Save the five service settings in a UTF-8 JSON object and select it explicitly at startup:

```powershell
npm start -- --config "$env:APPDATA\RS Levels\rs-levels.config.json"
```

The CLI also accepts `--config=path`. The [example configuration](../../examples/local-service.config.example.json) contains all safe defaults. Follow the [setup guide](../../docs/user-setup.md#save-service-settings) to copy and edit it outside the checkout or release directory. The file is read once; restart the service with the same command after editing it. There is no automatic file discovery or live reload, and starting without `--config` keeps the existing defaults and environment-variable behavior.

| JSON setting | Default | Validation |
| --- | --- | --- |
| `host` | `"127.0.0.1"` | Nonempty bare hostname or IP address; no whitespace, URL, port, credentials, or path. IPv6 addresses use their bare form, such as `"::1"`. |
| `port` | `8765` | JSON integer from `1` through `65535`. Environment and programmatic overrides retain port `0` for temporary test listeners. |
| `allowRemote` | `false` | JSON boolean. A non-loopback host also requires `true` to enable remote binding. |
| `corsOrigins` | The list below | JSON array of valid origins or supported patterns. A nonempty list replaces the defaults; `[]` restores defaults. |
| `staleMs` | `82800000` (23 hours) | JSON integer from `1000` through `86400000`. |

Default `corsOrigins`:

```json
[
  "http://127.0.0.1",
  "http://127.0.0.1:*",
  "http://localhost",
  "http://localhost:*",
  "http://[::1]:*",
  "null",
  "chrome-extension://*",
  "moz-extension://*"
]
```

Custom entries must be exact HTTP/HTTPS or browser-extension origins, `"null"`, or one of the default patterns above. HTTP/HTTPS origins are normalized to browser origin form (for example, `https://EXAMPLE.com:443` becomes `https://example.com`). Credentials, URL paths, queries, fragments, unrestricted `"*"`, and other wildcard patterns are rejected. Include the default entries you still need when replacing this list, especially extension origins if you use browser capture. CORS controls browser response access and does not enable remote binding.

For each setting, precedence is **defaults < saved JSON < environment variables < programmatic `options.config`**. Existing programmatic calls remain supported; `--config` selects the saved layer rather than becoming a higher-priority settings override. These environment variables remain available:

```text
RS_LEVELS_HOST=127.0.0.1
RS_LEVELS_PORT=8765
RS_LEVELS_ALLOW_REMOTE=0
RS_LEVELS_CORS_ORIGINS=
RS_LEVELS_STALE_MS=82800000
```

A defined blank environment variable resets its setting to the default (`false` for `RS_LEVELS_ALLOW_REMOTE`) instead of inheriting the file. Existing permissive environment/programmatic numeric and boolean parsing remains compatible; invalid values fall back as before and report a warning. In the JSON file, types and ranges are strict even when a higher-priority override would replace the value.

An explicitly selected missing or unreadable file, malformed JSON, non-object root, unknown key, or invalid value stops startup before binding. Errors identify the file and setting or syntax problem without dumping file contents or rejected values. UTF-8 files with a byte-order mark are accepted. Relative config paths resolve from the current working directory; the launch scripts first change to the checkout/package root. Use an absolute path for a saved shortcut.

Loopback is the safe default. To expose the API to another machine on Tailscale or another trusted private network, set both an explicit non-loopback `host` and `allowRemote: true` in the file, or use the existing environment variables:

```powershell
$env:RS_LEVELS_HOST = "0.0.0.0"
$env:RS_LEVELS_ALLOW_REMOTE = "1"
npm start
```

If a non-loopback host is requested without effective remote permission, the service falls back to `127.0.0.1` and reports a startup and `/health` warning. Remote binding also reports a warning when deliberately enabled. A higher-priority `RS_LEVELS_ALLOW_REMOTE=0` disables a saved opt-in. See [networking](../../docs/networking.md).

The extension's saved service URL remains separate. If you change the host or port, update extension options and run `Test Service`; it requests browser permission for the selected origin. Client examples and platform plugins must also use the matching URL.

Keep cookies, tokens, passwords, authorization headers, raw captures, and other private data out of this file. None is required or accepted by the service settings schema. Keep the actual file outside the repository and release directory, and do not paste its contents into logs or support bundles. The conventional filename `rs-levels.config.json` is ignored by Git and excluded from release packages; arbitrary private filenames must stay outside the packaged trees. Only the safe example is committed.

## Endpoints

```text
GET  /
GET  /docs
GET  /openapi.yaml
GET  /swagger.yaml
GET  /diagnostics
GET  /health
GET  /status
GET  /plugins
GET  /snapshot
GET  /levels
GET  /levels/:symbol
GET  /levels/:symbol?format=rows
GET  /levels/:symbol/rows
GET  /stats
GET  /stats/:symbol
GET  /stats/:symbol?format=rows
GET  /stats/:symbol/rows
GET  /ddbands
GET  /zones
GET  /references
GET  /tradingview
GET  /tradingview/:symbol
GET  /thinkorswim/:symbol
GET  /stream
POST /capture/api
```

/tradingview returns the all-symbol `RSLEVELS|2` paste payload used by the TradingView Pine indicator. /tradingview/:symbol returns a single-family payload for ES/MES or NQ/MNQ charts.

/thinkorswim/:symbol returns a paste-ready, display-only ThinkScript study containing one frozen stored symbol snapshot. It remains available for direct tooling; the extension's normal `Copy Thinkorswim study` action generates locally from its current selected-chart capture.

Captured user-added RocketScooter yellow lines, red lines, and purple CAT lines flow through `/levels`, `/levels/:symbol?format=rows`, `/levels/:symbol/rows`, `/references`, and `/tradingview` as `yellow-line`, `red-line`, and `cat` kinds.

/stats returns display-only context such as DD ratio, RI, Res, MRes, WRes, and liquidity-map codes like `Map BLD`. /stats/:symbol?format=rows and /stats/:symbol/rows provide simple row feeds for direct platform plugins and VARIS-style band indicators.

/status includes scrubbed per-symbol summaries so clients can confirm a selected symbol has captured levels before requesting an export.

/plugins returns the public display-plugin manifest from `plugins/manifest.json`.

/docs is a lightweight local API docs page. /openapi.yaml serves the OpenAPI 3.1 spec for Swagger UI, Redoc, Postman, Insomnia, and compatible clients.

/diagnostics returns scrubbed setup checks and hints for local API, capture, and private-network troubleshooting. It does not include raw captured URLs.

/health, /status, /snapshot, and /diagnostics compute service-side source freshness on each read. After the configured `staleMs` threshold (also settable through `RS_LEVELS_STALE_MS`), the source state becomes `stale` and `connected` becomes `false`. The default is 23 hours because RocketScooter levels are expected to remain stable after the daily post-open update window.

/stream is an SSE stream that emits the current snapshot immediately and emits a new snapshot after each accepted capture.

`POST /capture/api` is for the browser extension. Display clients should use the read-only endpoints.

## Safety Boundary

This service does not include trading strategy, broker connectivity, order entry, cancel, flatten, account balances, positions, PnL, or journals.

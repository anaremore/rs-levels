# Networking

RS Levels is local-first. The safe default is loopback-only access:

```text
host: 127.0.0.1
port: 8765
```

This lets the browser extension, examples, and chart plugins on the same machine read the local service without exposing the feed to the network.

## Tailscale And Private Networks

Some users may want to run RocketScooter capture on one machine and display levels on another machine over Tailscale or a trusted LAN.

That should be supported deliberately, not accidentally.

Recommended configuration model:

```text
RS_LEVELS_HOST=127.0.0.1       # default
RS_LEVELS_PORT=8765
RS_LEVELS_ALLOW_REMOTE=0       # default
RS_LEVELS_CORS_ORIGINS=       # optional comma-separated browser origins
RS_LEVELS_STALE_MS=82800000    # source freshness threshold, default 23 hours
```

You can save these settings in an explicitly selected JSON file instead of setting environment variables on every launch. Start from the [safe example](../examples/local-service.config.example.json), store your copy outside the checkout/release, and use `npm start -- --config "path/to/rs-levels.config.json"`. See the [configuration reference](../apps/local-service/README.md#configuration) for strict file validation and the [setup guide](user-setup.md#save-service-settings) for a Windows AppData workflow.

Defaults < saved JSON < environment variables < programmatic `options.config` is the per-setting precedence. Defined blank environment variables reset defaults. Settings apply at startup; restart with the same config path after editing.

To bind beyond loopback, require both an explicit host and an explicit remote-access flag:

```powershell
$env:RS_LEVELS_HOST = "0.0.0.0"
$env:RS_LEVELS_ALLOW_REMOTE = "1"
```

The equivalent saved settings are `"host": "0.0.0.0"` and `"allowRemote": true`. Prefer binding a specific trusted private interface address when possible. A non-loopback host without effective permission falls back to `127.0.0.1` with a warning. A higher-priority `RS_LEVELS_ALLOW_REMOTE=0` disables a saved `true`; leaving the flag blank also resets it to `false`. Selecting a config file never enables remote access by itself.

When remote access is enabled, `/health` should report:

```json
{
  "network": {
    "host": "0.0.0.0",
    "port": 8765,
    "remoteAccess": true,
    "warnings": ["Remote access is enabled. Use only on trusted private networks such as Tailscale."]
  }
}
```

## Extension Target

The browser extension posts to `http://127.0.0.1:8765` by default. Its service URL persists separately in browser storage. Users who intentionally change the service host or port must update that URL explicitly, grant permission for its exact origin when requested, and use `Test Service`. Service settings do not change extension permissions or client/plugin URLs.

The extension must never auto-discover or broadcast captured data to network hosts.


## Browser Origins

The API does not return `Access-Control-Allow-Origin: *`. By default it allows loopback browser tools, file-open dashboards (`Origin: null`), and browser-extension origins.

For a dashboard served from another trusted private origin, set:

```powershell
$env:RS_LEVELS_CORS_ORIGINS = "http://100.x.y.z:8080,http://127.0.0.1:5173"
```

This replaces the default origin list. The JSON `corsOrigins` setting likewise replaces defaults when nonempty; `[]` restores them. Include `"chrome-extension://*"` and `"moz-extension://*"` in a custom list if browser-extension capture is needed, plus any default loopback or file-open origins you still use. Custom file entries must be exact HTTP/HTTPS or browser-extension origins, `"null"`, or the documented default patterns; credentials, URL paths, unrestricted `"*"`, and other wildcard patterns are rejected.

This only affects browser CORS headers. It does not bind the service to the network; remote binding still requires an explicit non-loopback host plus effective remote permission. Keep the default origin list unless a specific browser client needs access.

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
RS_LEVELS_STALE_MS=10000       # source freshness threshold
```

To bind beyond loopback, require both an explicit host and an explicit remote-access flag:

```powershell
$env:RS_LEVELS_HOST = "0.0.0.0"
$env:RS_LEVELS_ALLOW_REMOTE = "1"
```

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

The browser extension should post to `http://127.0.0.1:8765` by default. Users who intentionally run the service elsewhere should configure the extension service URL explicitly.

The extension must never auto-discover or broadcast captured data to network hosts.


## Browser Origins

The API does not use wildcard CORS. By default it allows loopback browser tools, file-open dashboards (`Origin: null`), and browser-extension origins.

For a dashboard served from another trusted private origin, set:

```powershell
$env:RS_LEVELS_CORS_ORIGINS = "http://100.x.y.z:8080,http://127.0.0.1:5173"
```

This only affects browser CORS headers. It does not bind the service to the network; remote binding still requires `RS_LEVELS_HOST` plus `RS_LEVELS_ALLOW_REMOTE=1`.

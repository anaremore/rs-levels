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
    "warning": "Remote access is enabled. Use only on trusted private networks such as Tailscale."
  }
}
```

## Extension Target

The browser extension should post to `http://127.0.0.1:8765` by default. Users who intentionally run the service elsewhere should configure the extension service URL explicitly.

The extension must never auto-discover or broadcast captured data to network hosts.


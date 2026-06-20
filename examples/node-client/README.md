# Node Client Example

Dependency-free Node.js clients for the RS Levels local API.

## Snapshot

```powershell
node examples/node-client/snapshot.mjs
```

Read one symbol:

```powershell
node examples/node-client/snapshot.mjs http://127.0.0.1:8765 MES
```

Use an environment variable for local, LAN, or Tailscale service URLs:

```powershell
$env:RS_LEVELS_URL = "http://127.0.0.1:8765"
node examples/node-client/snapshot.mjs
```

## Stream

```powershell
node examples/node-client/stream.mjs
```

The stream client reads Server-Sent Events from `/stream` and prints snapshot summaries.

This example is display-only.
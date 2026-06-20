# Python Client Example

Dependency-free Python 3 clients for the RS Levels local API.

## Snapshot

```powershell
python examples/python-client/snapshot.py
```

Read one symbol:

```powershell
python examples/python-client/snapshot.py http://127.0.0.1:8765 MES
```

Use an environment variable for local, LAN, or Tailscale service URLs:

```powershell
$env:RS_LEVELS_URL = "http://127.0.0.1:8765"
python examples/python-client/snapshot.py
```

## Stream

```powershell
python examples/python-client/stream.py
```

The stream client reads Server-Sent Events from `/stream` and prints snapshot summaries.

This example is display-only.
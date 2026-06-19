# Architecture

RS Levels is a local-first data bridge with three layers:

```text
RocketScooter browser session
  -> browser extension capture
  -> local service normalization/cache
  -> read-only local APIs and display plugins
```

The system must stay display-data only. There is no broker connection, account state, order management, or trading strategy layer.

## Components

### Browser Extension

The extension runs in the user's browser and captures allowlisted RocketScooter responses from pages the user is already allowed to view.

Responsibilities:

- install as a Manifest V3 extension
- run early enough to observe startup API responses
- capture only allowlisted endpoint responses
- send safe capture messages to the local service
- show service connection state, last capture time, and version in a popup

The extension is not responsible for parsing all business meaning. It should forward enough source metadata for the local service to normalize consistently.

### Local Service

The local service is the only write-capable runtime component. It receives capture messages, normalizes display data, keeps the latest snapshot, and serves read-only clients.

Responsibilities:

- bind to `127.0.0.1` by default
- expose ingest endpoint for the extension
- expose read-only REST, Server-Sent Events, and WebSocket feeds
- store latest snapshot in memory
- optionally persist short local history later
- report source freshness and parser health

The first implementation should use Node.js and TypeScript because it is cross-platform, easy to package later, and matches browser-extension tooling.

### Schema Package

Schemas define the public contract between the local service and consumers.

Responsibilities:

- version the snapshot envelope
- define display level rows
- define source freshness and warnings
- define streaming message types
- keep compatibility notes as schemas evolve

### Display Plugins

Plugins consume the local service and render overlays in charting platforms.

Responsibilities:

- poll or subscribe to local feeds
- draw horizontal levels, labels, stats, and optional zones
- show stale/feed-down state clearly
- avoid platform trading APIs entirely

## Default Ports

Use ports that do not collide with private trading tools:

| Port | Purpose |
| --- | --- |
| `8765` | local HTTP API and extension ingest |
| `8766` | optional WebSocket server if split from HTTP later |

The initial service should keep HTTP and WebSocket on one port if practical.

## Data Flow

```text
1. User opens RocketScooter.
2. Extension observes allowlisted response.
3. Extension posts capture to local service.
4. Local service stores raw source metadata in memory for diagnostics.
5. Local service normalizes visible levels into public schemas.
6. API clients fetch `/snapshot` or subscribe to `/stream` / `/ws`.
7. Platform plugins render display overlays.
```

## Failure Modes

The UX should make the failure easy to understand:

| Failure | User-facing state |
| --- | --- |
| Local service not running | Extension popup says service unreachable. |
| Browser tab not open | API says capture disconnected or stale. |
| RocketScooter loaded but no recognized endpoints | API says waiting for recognized captures. |
| Parser cannot understand a response | API keeps last good snapshot and reports parser warning. |
| Plugin cannot reach service | Plugin clears or marks levels stale, depending on platform capability. |

## Public API Principles

- Prefer stable, boring JSON over platform-specific formats.
- Include timestamps and schema versions everywhere.
- Expose display data, not inferred trading advice.
- Keep raw captured payloads out of public endpoints by default.
- Add compatibility endpoints only when a platform needs them.

## Packaging Direction

Start with developer-friendly packages:

- unpacked browser extension
- Node.js local service
- source-level plugin install docs

Later releases can add:

- standalone service binaries
- signed release archives
- browser store packaging
- platform-specific plugin bundles


# UX Principles

RS Levels should feel like a quiet local utility: obvious status, stable feeds, and no surprise behavior.

## Product Promises

- The user remains in control of their own RocketScooter session.
- Data stays on the local machine by default.
- The service explains what it knows, what is stale, and what is missing.
- Chart plugins display levels; they never trade.

## Extension UX

The popup should answer four questions:

1. Is the local service reachable?
2. Is a RocketScooter tab being observed?
3. When was the last recognized capture?
4. Which endpoints have been seen recently?
5. Can capture be paused without leaving the popup?

Recommended states:

| State | Meaning |
| --- | --- |
| Service Offline | Local service is not reachable. |
| Waiting For RocketScooter | Service is online, but no active tab/capture yet. |
| Capturing | Recent recognized captures are flowing. |
| Stale | Last recognized capture is older than the freshness window. |
| Error | Extension cannot send captures or service rejected a payload. |

The popup should avoid trading language. It should speak in terms of captures, snapshots, endpoints, and display feeds.

## Service UX

The service should support both CLI and browser-based status.

CLI startup should print:

```text
RS Levels local service
API: http://127.0.0.1:8765
Status: waiting for browser capture
```

`GET /health` should be readable by humans and scripts. A future `/` page can show status, latest captures, and links to docs.

## API UX

API consumers should not need to reverse-engineer source quirks.

Every response should include:

- `schemaVersion`
- `generatedAt`
- source freshness
- warnings when data is stale or partial

Read endpoints should be safe to call frequently from chart plugins.

## Plugin UX

Plugins should prioritize clarity over decoration:

- draw only recognized levels
- label lines with level name and price
- show stale state without pretending data is current
- keep configuration small: service URL, symbol override, labels on/off, zones on/off
- never ask for account credentials

## First-Run UX

Ideal first-run flow:

1. Start the local service.
2. Load the extension.
3. Open RocketScooter.
4. Open `http://127.0.0.1:8765/health`.
5. Add a display plugin or run an example client.

The docs should make this path work before advanced packaging exists.

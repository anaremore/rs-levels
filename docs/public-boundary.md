# Public Boundary

RS Levels is a local display-data bridge. It captures RocketScooter level data from a user's own browser session and exposes normalized local feeds for display tools.

## Allowed

- Browser extension capture for explicitly allowlisted RocketScooter endpoints.
- Local ingest, normalization, latest-snapshot storage, and health reporting.
- REST, Server-Sent Events, and WebSocket feeds.
- Display-only chart plugins.
- Example clients that read and render level data.

## Not Allowed

- Trading strategy or setup recommendations.
- Sizing, risk, confluence, automation, or trade-decision logic.
- Order entry, cancel, flatten, broker adapters, or execution APIs.
- Account IDs, balances, PnL, trade journals, batches, or positions.
- Private logs, screenshots, credentials, tokens, cookies, request bodies, or account exports.
- Redistribution of RocketScooter data to any remote service by default.

## Naming

Use neutral display/data language:

- "levels"
- "maps"
- "references"
- "snapshots"
- "display feed"

Avoid trading-system language:

- "Full Auto"
- "execution"
- "order"
- "entry signal"
- "strategy"
- "account batch"
- "PnL"


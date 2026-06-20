# Implementation Slices

Each slice should be committed and pushed before starting the next one.

## Slice 1: Public Skeleton

Status: complete.

- Repo shape
- Public boundary
- Privacy/security docs
- Placeholder apps, packages, plugins, and examples

## Slice 2: Schemas

Goal: define the public contracts before parser extraction.

Deliverables:

- TypeScript types for snapshot envelope, level rows, freshness, and stream messages
- JSON examples for `/snapshot` and `/levels/:symbol`
- lightweight validation tests

No RocketScooter parser code yet.

## Slice 3: Local Service Shell

Status: complete.

Goal: provide a cross-platform service with normalized in-memory captured data.

Deliverables:

- Node.js service
- `/health`
- `/snapshot`
- `/levels`
- `/levels/:symbol`
- `/stream`
- browser capture ingest
- Sierra text output
- TradingView compact payload and JSON export

No browser extension yet.

## Slice 4: Browser Extension Shell

Status: complete.

Goal: connect extension to service without real parser complexity.

Deliverables:

- Manifest V3 extension
- popup with service status, diagnostics, and copy buttons
- content/page hook skeleton
- local capture POST shape
- options page for service URL and capture allowlist
- no credentials, cookies, auth headers, or arbitrary page content

## Slice 5: Parser Extraction

Status: next.

Goal: carefully extract only display-level parsing.

Deliverables:

- allowlisted endpoint capture parsing
- normalized level rows
- source freshness and warnings
- private-term scan reviewed before commit

Do not copy strategy, execution, account, or automation code.

## Slice 6: Platform Display Plugins

Status: in progress.

Goal: add display integrations one platform at a time.

Recommended order:

1. TradingView paste-based Pine indicator. Implemented first because TradingView is a priority and Pine cannot poll localhost directly.
2. Sierra Chart
3. NinjaTrader
4. Quantower
5. Bookmap. Initial Java add-on source included.

Each plugin must include a safety test or review note confirming it does not call platform order APIs.

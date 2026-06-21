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
- generic display row output
- TradingView JSON paste export

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

Status: in progress.

Goal: carefully extract only display-level parsing.

Deliverables:

- allowlisted endpoint capture parsing: implemented through generic display-level parser
- normalized level rows: implemented for object, compact row, and keyed map shapes
- source freshness and warnings: implemented in the local service/store
- endpoint summary scrubbing: implemented for raw URLs and identifier-like path segments
- private-term scan reviewed before commit

Do not copy strategy, execution, account, or automation code.

## Slice 6: Platform Display Plugins

Status: public source artifacts complete; platform compile/install validation planned.

Goal: add display integrations one platform at a time.

Recommended order:

1. TradingView paste-based Pine indicator. Implemented first because TradingView is a priority and Pine cannot poll localhost directly.
2. Sierra Chart. ACSIL source included with kind-aware labels and zone fills.
3. NinjaTrader. NinjaScript source included with kind-aware labels and zone fills.
4. Quantower. Indicator source included with kind-aware labels and zone fills.
5. Bookmap. Java add-on source included with kind-aware value-line colors.

Each plugin must include a safety test or review note confirming it does not call platform order APIs.

## Slice 7: Packaging And Release Artifacts

Status: in progress.

Goal: make public-safe releases easy to inspect, verify, and install across Windows, macOS, and Linux.

Deliverables:

- source-style release directory with manifest and file checksums
- source zip archive with checksum sidecar
- standalone browser-extension zip archive with checksum sidecar
- cross-platform local service launch scripts
- package tests and release checklist updates
- CI coverage across Windows, macOS, and Linux

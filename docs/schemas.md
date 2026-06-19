# Schemas

Schemas are intentionally display-oriented. They describe visible levels and source freshness, not trading decisions.

Current package: `packages/schemas`

Current schema version: `0.1.0`

## What Is Defined

- Snapshot envelope
- Source freshness and endpoint summaries
- Symbol snapshots
- Display level rows
- Basic stats shown as context
- Validation helpers for sample payloads

## Development

Run schema validation from the repo root:

```powershell
npm run test:schemas
```

Sample payloads live in:

```text
packages/schemas/examples/
```

See [schema-reference.md](schema-reference.md) for field-level details.

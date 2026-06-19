# Extraction Checklist

Use this checklist before copying code from any private workspace.

## Before Copying

- Confirm the target file belongs to capture, parsing, schema, local API, or display only.
- Remove strategy, execution, account, trade journal, and automation references.
- Rename private product names and local storage keys.
- Change ports and config namespaces.
- Keep no git history from private repositories.

## After Copying

Run scans:

```powershell
npm run scan:private
npm run scan:secrets
```

Documentation-only hits are allowed when they describe the public safety boundary. Implementation hits fail the scan and must be removed or explicitly reviewed before committing.

## Commit Rule

Prefer small commits:

1. skeleton and docs
2. schemas
3. local service shell
4. extension shell
5. parser extraction
6. display plugins
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
rg -n "rithmic|full auto|execution|flatten|cancel|order|account|batch|pnl|journal|audit|strategy"
rg -n "password|token|secret|cookie|authorization|bearer|private key"
```

Review every hit. If a term is present only in safety docs, keep it. If it appears in implementation as behavior, remove or isolate it before committing.

## Commit Rule

Prefer small commits:

1. skeleton and docs
2. schemas
3. local service shell
4. extension shell
5. parser extraction
6. display plugins


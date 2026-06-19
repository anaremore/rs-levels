# Contributing

RS Levels is intended to be public-safe and display-only.

Before opening a pull request:

- Keep implementation scoped to capture, normalization, local APIs, schemas, examples, or display plugins.
- Do not add trading strategy, sizing, account, PnL, broker, or execution behavior.
- Do not commit private logs, screenshots, captures, database files, credentials, account IDs, or tokens.
- Run private-term and secret scans.

```powershell
npm run scan:private
npm run scan:secrets
```

Every scan hit must be reviewed. Some terms are allowed in safety documentation; implementation code should remain display-only.


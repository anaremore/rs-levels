# CI

GitHub Actions runs the public verification workflow on pushes and pull requests to `main`.

Workflow: `.github/workflows/ci.yml`

The workflow runs:

```text
npm test
npm run scan:private
npm run scan:secrets
npm run package
```

It also uploads the generated source-style release directory as a build artifact.

The scans are intentionally conservative. Some terms appear in safety documentation and checklist files; implementation files should remain display-only and free of private strategy, broker, credential, or account behavior.
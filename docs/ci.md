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

The workflow uses current major versions of the official checkout, Node setup, and artifact upload actions while testing the project on Node.js 20 for user compatibility.

The scans are intentionally conservative. Some terms appear in safety documentation and checklist files; implementation files should remain display-only and free of private strategy, broker, credential, or account behavior.

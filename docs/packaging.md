# Packaging

RS Levels currently ships as a source-style local package. This keeps the project cross-platform and avoids native installer assumptions while the API, extension, and TradingView workflow are stabilizing.

## Build A Release Directory

```powershell
npm run package
```

Output:

```text
dist/rs-levels-0.0.0/
```

The release directory includes:

- local API service
- browser extension
- schema/parser/exporter packages
- TradingView Pine indicator
- examples
- documentation
- OpenAPI spec
- tests
- `RELEASE-MANIFEST.json`
- `SHA256SUMS.txt`

## Verify Packaging Inputs

```powershell
npm run package:check
```

`npm test` runs the package check so missing release inputs are caught before a commit.

## Extension Install From Package

Load this directory as an unpacked Chromium extension:

```text
dist/rs-levels-0.0.0/apps/browser-extension
```

## Service Start From Package

From the package root:

```powershell
npm start
```

Default URL:

```text
http://127.0.0.1:8765
```

## Future Installers

Native installers and signed extension artifacts can be added later. Until then, the release directory is the canonical cross-platform artifact.
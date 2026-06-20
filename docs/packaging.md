# Packaging

RS Levels currently ships as a source-style local package. This keeps the project cross-platform and avoids native installer assumptions while the API, extension, and TradingView workflow are stabilizing.

## Build A Release Directory

```powershell
npm run package
```

Output:

```text
dist/rs-levels-0.0.0/
dist/rs-levels-0.0.0.zip
dist/rs-levels-0.0.0.zip.sha256
```

The release directory includes:

- local API service
- cross-platform service launch scripts
- browser extension
- schema/parser/exporter packages
- TradingView Pine indicator
- examples
- documentation
- OpenAPI spec
- tests
- `RELEASE-MANIFEST.json`
- `SHA256SUMS.txt`

The zip artifact contains the release directory as its top-level folder. The `.zip.sha256` sidecar verifies the archive itself; `SHA256SUMS.txt` verifies files inside the unpacked release directory.

## Verify Packaging Inputs

```powershell
npm run package:check
```

`npm test` runs the package check and package-release test so missing release inputs and broken zip artifact generation are caught before a commit.

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

Packaged releases also include wrapper scripts:

```text
scripts/start-local-service.cmd
scripts/start-local-service.ps1
scripts/start-local-service.sh
```

The scripts call the same local service CLI as `npm start`. Existing environment variables such as `RS_LEVELS_HOST`, `RS_LEVELS_PORT`, and `RS_LEVELS_ALLOW_REMOTE` still control loopback and trusted private-network behavior.

Default URL:

```text
http://127.0.0.1:8765
```

## Future Installers

Native installers and signed extension artifacts can be added later. Until then, the release directory and zip archive are the canonical cross-platform artifacts.

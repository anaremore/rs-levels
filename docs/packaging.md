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
dist/rs-levels-browser-extension-0.1.1.zip
dist/rs-levels-browser-extension-0.1.1.zip.sha256
```

The release directory includes:

- local API service
- cross-platform service launch scripts
- browser extension
- schema/parser/exporter packages
- TradingView Pine indicator
- display plugin manifest
- examples
- documentation
- OpenAPI spec
- tests
- `RELEASE-MANIFEST.json`
- `SHA256SUMS.txt`

The zip artifact contains the release directory as its top-level folder. The `.zip.sha256` sidecar verifies the archive itself; `SHA256SUMS.txt` verifies files inside the unpacked release directory.

The browser-extension zip is a focused install artifact with `manifest.json` at the archive root. It includes the extension README and runtime `src/` files, but not the extension test suite.

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

Or unzip the focused browser-extension artifact and load the extracted folder:

```text
dist/rs-levels-browser-extension-0.1.1.zip
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

Use `--help` or `--version` as a non-binding smoke check:

```powershell
scripts/start-local-service.ps1 --help
```

Default URL:

```text
http://127.0.0.1:8765
```

## Future Installers

Native installers and signed extension artifacts can be added later. Until then, the release directory, source zip archive, standalone browser-extension zip, and checksum sidecars are the canonical cross-platform artifacts.

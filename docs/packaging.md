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
dist/rs-levels-browser-extension-<extension-version>.zip
dist/rs-levels-browser-extension-<extension-version>.zip.sha256
dist/rs-levels-browser-extension-firefox-<extension-version>.zip
dist/rs-levels-browser-extension-firefox-<extension-version>.zip.sha256
```

The release directory includes:

- local API service
- cross-platform service launch scripts
- browser extension
- schema/parser/exporter packages
- TradingView Pine indicator
- display plugin manifest
- examples
- safe local-service JSON configuration example
- documentation
- OpenAPI spec
- tests
- `RELEASE-MANIFEST.json`
- `SHA256SUMS.txt`

The zip artifact contains the release directory as its top-level folder. The `.zip.sha256` sidecar verifies the archive itself; `SHA256SUMS.txt` verifies files inside the unpacked release directory.

Each browser-extension ZIP is a focused install artifact with the correct browser-specific `manifest.json` at the archive root. Both include the same extension README, assets, and runtime `src/` files, but not the extension test suite. The artifact without a browser suffix targets Chrome/Chromium; the `-firefox-` artifact targets Firefox Desktop 140+ and declares Firefox's built-in data-collection consent categories. Firefox for Android is not currently supported.

## Verify Packaging Inputs

```powershell
npm run package:check
```

`npm test` runs the package check and package-release test so missing release inputs and broken zip artifact generation are caught before a commit.

## Extension Install From Package

Load this directory as an unpacked Chrome/Chromium extension:

```text
dist/rs-levels-0.0.0/apps/browser-extension
```

Or unzip the focused Chrome/Chromium artifact and load the extracted folder:

```text
dist/rs-levels-browser-extension-<extension-version>.zip
```

For Firefox, open `about:debugging`, choose `This Firefox` and `Load Temporary Add-on`, then select:

```text
dist/rs-levels-browser-extension-firefox-<extension-version>.zip
```

Firefox temporary add-ons are removed on restart. A permanent Firefox install must use an artifact signed by Mozilla.

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

To reuse saved settings across upgrades, copy `examples/local-service.config.example.json` to a private location outside the extracted release and select that copy explicitly:

```powershell
npm start -- --config "$env:APPDATA\RS Levels\rs-levels.config.json"
scripts/start-local-service.ps1 --config "$env:APPDATA\RS Levels\rs-levels.config.json"
```

Create the file once using the [setup guide](user-setup.md#save-service-settings), edit it as needed, and retain it when replacing the release directory. All three wrappers forward arguments and first change to the package root; relative config paths therefore resolve from that root. Use an absolute path for a saved shortcut. The service reads the file at startup, so restart after edits. Starting without `--config` retains existing behavior.

The conventional private filename `rs-levels.config.json` is excluded from Git and release collection even when placed under a packaged directory. Release packaging does not generally follow Git ignore rules, so arbitrary private config filenames must stay outside the checkout/package. Only the safe example belongs in the release. Keep credentials, raw captures, and private diagnostics out of configuration files.

Use `--help` or `--version` as a non-binding smoke check:

```powershell
scripts/start-local-service.ps1 --help
```

Default URL:

```text
http://127.0.0.1:8765
```

## Future Installers

Native installers and signed store artifacts can be added later. Until then, the release directory, source zip archive, Chrome/Chromium and Firefox browser-extension ZIPs, and checksum sidecars are the canonical cross-platform artifacts.

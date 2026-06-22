# Release Checklist

Before any public release:

- Choose and add an explicit license.
- Confirm all code is display-data only.
- Run private-term and secret scans.
- Build from a clean clone.
- Run `npm run package:check`; it verifies critical API, extension, TradingView, plugin, and scan artifacts are present.
- Run `npm run package` and publish the release zip, browser-extension zip, `RELEASE-MANIFEST.json`, `SHA256SUMS.txt`, and `.sha256` sidecars.
- Confirm the packaged CLI smoke checks pass from the release directory with `--help` and `--version`.
- Test service startup on Windows, macOS, and Linux.
- Test extension install instructions from the source package and standalone browser-extension zip from scratch.
- Verify the service binds to `127.0.0.1` by default.
- Verify plugins do not reference platform order APIs.
- Complete the platform validation checklist in [Platform validation](platform-validation.md) for any changed plugin source.
- Publish checksums for packaged artifacts.

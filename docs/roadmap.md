# Roadmap

## Milestone 0: Public Skeleton

- Public-safe README and docs.
- Explicit privacy/security boundary.
- No extracted private code.

## Milestone 1: Schemas

- Define versioned snapshot, level, source freshness, and stream message schemas.
- Add schema examples and validation tests.

## Milestone 2: Local Service

- Start a cross-platform localhost service.
- Implement `/health`, `/status`, `/snapshot`, and `/capture/api`.
- Keep data local and bind to `127.0.0.1` by default.

## Milestone 3: Browser Extension

- Add Manifest V3 extension shell.
- Capture only allowlisted RocketScooter responses.
- Show connection status in a popup.

## Milestone 4: Display Plugins

- Sierra Chart display study.
- NinjaTrader display indicator.
- Quantower display indicator.
- Bookmap display add-on.

## Milestone 5: Packaging

- Build zip artifacts.
- Add checksums.
- Test clean install on Windows, macOS, and Linux.


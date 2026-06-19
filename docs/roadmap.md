# Roadmap

## Milestone 0: Public Skeleton

Status: complete.

- Public-safe README and docs.
- Explicit privacy/security boundary.
- No extracted private code.

## Milestone 1: Schemas

Status: complete.

- Versioned snapshot, level, source freshness, and stream message schemas.
- Schema examples and validation tests.

## Milestone 2: Local Service

Status: in progress.

- Cross-platform localhost service.
- Implemented `/health`, `/status`, `/snapshot`, `/levels`, `/ddbands`, `/references`, `/stream`, and `/capture/api`.
- Safe loopback default with explicit Tailscale/private-network opt-in.
- Next: persisted settings, packaged app wrapper, and UI-visible diagnostics.

## Milestone 3: Browser Extension

Status: planned.

- Manifest V3 extension shell.
- Capture only allowlisted RocketScooter responses.
- Show connection status in a popup.
- Add copy/export actions for JSON and TradingView paste payloads.

## Milestone 4: Display Plugins

Status: planned.

- Sierra Chart display study.
- NinjaTrader display indicator.
- Quantower display indicator.
- Bookmap display add-on.
- TradingView Pine indicator with paste-based level input.

## Milestone 5: Packaging

Status: planned.

- Build zip artifacts.
- Add checksums.
- Test clean install on Windows, macOS, and Linux.
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
- Implemented `/health`, `/status`, `/diagnostics`, `/snapshot`, `/levels`, `/ddbands`, `/references`, `/stream`, and `/capture/api`.
- Safe loopback default with explicit Tailscale/private-network opt-in.
- Source freshness is reported through dynamic `ageMs`, `connected`, and `stale` state.
- Next: persisted settings and packaged app wrapper.

## Milestone 3: Browser Extension

Status: shell complete.

- Manifest V3 extension shell.
- Capture only allowlisted RocketScooter responses.
- Show connection status, post timing, and last issue in a popup.
- Add copy/export actions for TradingView paste payloads, JSON, and scrubbed diagnostics.
- Next: field testing against real RocketScooter endpoint shapes and parser hardening.

## Milestone 4: Display Plugins

Status: in progress.

- Sierra Chart display study. Initial ACSIL source included.
- NinjaTrader display indicator.
- Quantower display indicator.
- Bookmap display add-on.
- TradingView Pine indicator with paste-based level input. Implemented as the first display plugin path.

## Milestone 5: Packaging

Status: planned.

- Build zip artifacts.
- Add checksums.
- Test clean install on Windows, macOS, and Linux.

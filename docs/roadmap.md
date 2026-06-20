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

Status: public API foundation complete; app wrapper planned.

- Cross-platform localhost service.
- Implemented `/docs`, `/openapi.yaml`, `/swagger.yaml`, `/health`, `/status`, `/diagnostics`, `/snapshot`, `/levels`, `/ddbands`, `/references`, `/tradingview/:symbol`, `/stream`, and `/capture/api`.
- Safe loopback default with explicit Tailscale/private-network opt-in.
- Source freshness is reported through dynamic `ageMs`, `connected`, and `stale` state.
- Public source endpoint summaries omit raw URLs and scrub identifier-like path segments.
- API responses report the local service version and use `Cache-Control: no-store`.
- Next: persisted settings and packaged app wrapper.

## Milestone 3: Browser Extension

Status: public setup foundation complete; field validation planned.

- Manifest V3 extension shell.
- Capture only allowlisted RocketScooter responses.
- Show connection status, service version, post timing, capture counters, and last issue in a popup.
- Add copy/export actions for TradingView paste payloads, JSON, and scrubbed diagnostics.
- Add options-page service reachability check for localhost and trusted private-network URLs.
- Guard TradingView copy while source data is waiting or stale.
- Next: field testing against real RocketScooter endpoint shapes.

## Milestone 4: Display Plugins

Status: initial source artifacts complete; platform compile/install validation planned.

- Sierra Chart display study. Initial ACSIL source included.
- NinjaTrader display indicator. Initial NinjaScript source included.
- Quantower display indicator. Initial indicator source included.
- Bookmap display add-on. Initial Java source included.
- TradingView Pine indicator with paste-based level input, kind toggles, line controls, status label, and max-level display control.

## Milestone 5: Packaging

Status: in progress.

- Build source-style release directory.
- Add `RELEASE-MANIFEST.json` and `SHA256SUMS.txt`.
- Verify critical API, extension, TradingView, plugin, docs, and scan artifacts in `npm run package:check`.
- Next: zip artifacts and packaged app wrapper.
- Test clean install on Windows, macOS, and Linux.

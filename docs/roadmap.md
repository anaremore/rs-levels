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

Status: public API foundation complete; launch scripts included; app wrapper planned.

- Cross-platform localhost service.
- Implemented `/docs`, `/openapi.yaml`, `/swagger.yaml`, `/health`, `/status`, `/plugins`, `/diagnostics`, `/snapshot`, `/levels`, `/stats`, `/stats/:symbol`, `/sierra/:symbol`, `/ddbands`, `/references`, `/tradingview`, `/tradingview/:symbol`, `/stream`, and `/capture/api`.
- Safe loopback default with explicit Tailscale/private-network opt-in.
- Generic display parser normalizes object, compact row, and keyed map level shapes.
- Recaptures replace previous levels from the same scrubbed endpoint key while preserving other display endpoints.
- Source freshness is reported through dynamic `ageMs`, `connected`, and `stale` state with a 23-hour default stale window for daily RocketScooter levels.
- Public source endpoint summaries omit raw URLs and scrub identifier-like path segments.
- API responses report the local service version and use `Cache-Control: no-store`.
- `/status` and diagnostics expose scrubbed per-symbol summaries for plugin and extension readiness checks.
- Service CLI includes non-binding `--help` and `--version` smoke paths.
- Next: persisted settings and native packaged app wrapper.

## Milestone 3: Browser Extension

Status: public setup foundation complete; field validation planned.

- Manifest V3 extension shell.
- Capture only allowlisted RocketScooter responses.
- Skip clearly non-text response content types before body reads.
- Show connection status, service version, post timing, capture counters, and last issue in a popup.
- Add popup capture pause/resume toggle backed by extension storage.
- Add popup `Send to TradingView` for all-symbol and selected-scope exports, plus `Copy payload instead` and scrubbed diagnostics.
- Make the `RSLEVELS|2` payload fillable through an opt-in, fail-closed TradingView settings helper and directly pasteable through the manual fallback.
- Add quick links to local API docs and the display-plugin manifest.
- Add options-page service reachability check for localhost and trusted private-network URLs.
- Guard TradingView copy while source data is waiting or stale.
- Next: field testing against real RocketScooter endpoint shapes.

## Milestone 4: Display Plugins

Status: public source artifacts complete; platform compile/install validation planned.

- Sierra Chart display study with local polling, kind-aware labels, and zone fills.
- NinjaTrader display indicator with local polling, kind-aware labels, and zone fills.
- Quantower display indicator with local polling, kind-aware labels, and zone fills.
- Bookmap display add-on with local polling and kind-aware value-line colors.
- TradingView Pine indicator with settings-field handoff or paste-based level input, kind toggles, color controls, line controls, zone fills, stats panel, label controls, and max-level display control.
- Direct platform adapters display DD/RI/Res/MRes/WRes/liquidity-map context from the platform's display feed: `/sierra/:symbol` for Sierra Chart and `/stats/:symbol?format=rows` for NinjaTrader, Quantower, and Bookmap.
- Separate VARIS Zones indicators consume the same RI context for VWAP band spacing across TradingView, Sierra Chart, NinjaTrader, Quantower, and Bookmap.
- Public `plugins/manifest.json` inventory with static display-only validation.
- Public platform validation checklist for compile/install and live RocketScooter field checks.

## Milestone 5: Packaging

Status: in progress.

- Build source-style release directory.
- Add `RELEASE-MANIFEST.json` and `SHA256SUMS.txt`.
- Verify critical API, extension, TradingView, plugin, docs, and scan artifacts in `npm run package:check`.
- Build source zip archive and checksum sidecar.
- Build standalone browser-extension zip archive and checksum sidecar.
- Include cross-platform local service launch scripts.
- Run CI verification on Ubuntu, Windows, and macOS.
- Next: native packaged app wrapper.
- Test clean install on Windows, macOS, and Linux.

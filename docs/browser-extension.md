# Browser Extension

The RS Levels browser extension is the first-priority capture UX.

## What It Does

- Runs as a Manifest V3 extension.
- Loads only on `rocketscooter.com` host patterns.
- Injects a page hook at `document_start` so fetch/XHR responses can be observed from the page context.
- Captures only response URLs that match the configured allowlist.
- Posts capture payloads to the local service at `/capture/api`.
- Provides a popup capture toggle plus TradingView, JSON, scrubbed diagnostics, local API docs, and display-plugin manifest workflows.
- Provides a popup `Reconnect Tab` action for the active RocketScooter tab when the extension was loaded after the page was already open.
- Shows scrubbed capture-hook counters for observed, ignored, skipped, and posted responses.

## What It Avoids

- No arbitrary page text scraping.
- No request auth data forwarding.
- No stored credentials.
- No strategy, broker, or automation behavior.

## User Flow

1. Start the local service.
2. Load `apps/browser-extension` unpacked.
3. Open RocketScooter.
4. Check the popup status.
5. Use the capture toggle when you need to pause or resume allowlisted capture.
6. Use `Copy TradingView` to paste levels into `plugins/tradingview/rs-levels.pine`.
7. Use `Copy JSON` when another local tool needs a manual export.
8. Use `Plugins` to inspect the local display-adapter manifest.
9. Use `Reconnect Tab` if the popup is waiting and the RocketScooter page was already open when the extension was loaded or reloaded.
10. Use `Copy Diagnostics` when troubleshooting local API, extension, or stale-source setup.

The popup distinguishes live, waiting, offline, and stale source states so an old capture is not presented as live data.

Packaged releases include a standalone extension artifact at `dist/rs-levels-browser-extension-0.1.0.zip`. Unzip that artifact and load the extracted folder when you want a focused extension package instead of the full source tree.

Capture-hook counters are aggregate only:

- `Observed`: fetch/XHR responses seen by the page hook.
- `Ignored`: responses skipped because the URL did not match the allowlist.
- `Skipped`: allowlisted responses skipped because capture is disabled, too large, empty, non-text, or unreadable.
- `Hook`: the most recent scrubbed hook reason.

These counters do not include ignored URLs, response bodies, request headers, cookies, or page text.

## Settings

Default service URL:

```text
http://127.0.0.1:8765
```

Default endpoint allowlist:

```text
level
levels
line
lines
chart
charts
ddband
ddbands
dd-band
band
bands
zone
zones
pivot
pivots
reference
references
indicator
indicators
```

Users can change these in the options page. The popup capture toggle updates the same capture-enabled setting. The allowlist is intentionally URL-substring based so users can adapt to harmless RocketScooter endpoint naming changes without code edits. Existing extension installs migrate older defaults to include these display-feed patterns after the extension reloads or updates.

Capture is not symbol-selected. If a single allowlisted RocketScooter response includes both ES/MES and NQ/MNQ display data, the local parser stores both symbols; the popup symbol selector only controls which export is copied. RocketScooter CQG-style current-contract symbols such as `F.US.EP...` are stored as `MES`, and `F.US.ENQ...` symbols are stored as `MNQ`, so users can apply those levels to ES/MES or NQ/MNQ charts in their destination platform.

## Tailscale And Private Networks

For local-only use, keep the default service URL. For Tailscale or another trusted private network, start the local service with remote access explicitly enabled and then set the extension service URL to that private address.

When a non-default service URL is saved, Chrome will ask for permission to reach that specific origin. The broad optional host permission exists only so the extension can support user-selected localhost, LAN, and Tailscale service URLs without granting those origins by default.

The extension does not discover or broadcast service locations.

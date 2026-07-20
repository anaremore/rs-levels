# Privacy And Security

RS Levels is local-first. The default service must bind to loopback only and avoid sending captured data to any external server.

## Extension Capture Rules

The browser extension may forward:

- allowlisted RocketScooter response body text
- endpoint path
- HTTP status
- capture timestamp
- a small safe request summary when needed to disambiguate display data

The browser extension must not forward:

- cookies
- auth headers
- passwords
- tokens
- arbitrary request bodies
- arbitrary page content
- screenshots
- browser history

## Optional TradingView Handoff

- The extension asks for `https://*.tradingview.com/*` access only after the user clicks `Send to TradingView`; copy/paste does not require that access.
- The latest sanitized TradingView snapshot is stored in extension-only `chrome.storage.session`, not page `localStorage`. Raw capture bodies are not stored there. The record is cleared by browser restart or extension update.
- Each send freezes one validated payload and injects an isolated helper into frame 0 of the selected open TradingView chart. The pending handoff, payload reference, observer, and retries are cleared after at most 45 seconds.
- The helper searches visible page markup only for the exact static `RS Levels Payload` label and nearby writable text controls, requires one unambiguous match, writes only that field, and does not retain or transmit page text, click `OK`, read chart data, or write TradingView storage.
- Filling the field exposes the payload to the TradingView page in the same way as manual paste. The user must review the value and choose whether to confirm it.
- Confirm that extension-assisted input is permitted by the TradingView terms that apply to your use before granting access.


## Local Service Rules

- Bind to `127.0.0.1` by default.
- Require an explicit config flag before any LAN binding is allowed.
- Store only display data needed for current/latest snapshots unless the user enables history.
- Keep local database, logs, and captures out of git.
- Do not include telemetry by default.

## Public Release Checks

Before publishing a release or pushing extracted code, run:

```powershell
npm run scan:private
npm run scan:secrets
```

The scan scripts are implemented in `tools/scan-text.mjs` so they work without external command-line tools. Safety documentation may contain boundary terms, but implementation hits fail the scan and must be removed or explicitly reviewed before release. Plugin README files may describe the safety boundary; plugin source files are scanned as implementation.

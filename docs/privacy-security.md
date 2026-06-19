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

## Local Service Rules

- Bind to `127.0.0.1` by default.
- Require an explicit config flag before any LAN binding is allowed.
- Store only display data needed for current/latest snapshots unless the user enables history.
- Keep local database, logs, and captures out of git.
- Do not include telemetry by default.

## Public Release Checks

Before publishing a release or pushing extracted code, run private-term and secret scans. At minimum:

```powershell
rg -n "account|rithmic|full auto|execution|flatten|cancel|order|password|token|secret|audit|journal|pnl|live account"
rg -n "AKIA|BEGIN .*PRIVATE KEY|Authorization:|Cookie:|Bearer "
```

Review every hit manually. Some words may appear in safety docs, but implementation code should not expose trading or account behavior.


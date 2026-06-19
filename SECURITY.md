# Security

RS Levels should run locally by default and should not transmit captured data to external services.

## Supported Scope

Security issues include:

- accidental capture of credentials, cookies, auth headers, or request bodies
- unintended network exposure beyond loopback
- local API endpoints that mutate data unexpectedly
- display plugins that call platform trading APIs
- committed private data or secrets

## Local Defaults

- Bind local services to `127.0.0.1` by default.
- Require explicit user configuration for LAN access.
- Do not enable telemetry by default.
- Keep captures, snapshots, logs, and databases out of git.

## Reporting

Until a public security contact is chosen, report issues privately to the repository owner.


# Browser Extension

Planned Manifest V3 browser extension for allowlisted RocketScooter response capture.

Responsibilities:

- run at `document_start`
- capture explicitly allowlisted response bodies
- send safe capture payloads to the local service
- show local-service connection status in the popup

Non-responsibilities:

- storing credentials
- forwarding cookies or auth headers
- reading arbitrary page content
- placing or managing trades


# Core Parser

Shared parser and normalizer package for converting captured RocketScooter display data into RS Levels schemas.

This package should not contain strategy, sizing, order, account, or broker logic.

The parser accepts generic display-level shapes:

- objects with display names such as `name`, `label`, or `pivotName` and prices such as `price`, `value`, or `pivotPrice`
- compact rows such as `["OVNHP", "7,537.00", 41, 98, 255]`
- keyed maps such as `{ "DD Upper": 7579.75 }` or `{ "OVNMHP": { "target": 30125.5 } }`
- colors as hex strings, `[red, green, blue]`, `{ r, g, b }`, or `{ red, green, blue }`

Endpoint summaries use path-only keys and scrub long numeric or identifier-like path segments before they reach public snapshots.

Parsed levels include the scrubbed `metadata.endpointKey` so the local service can replace previous rows from the same captured endpoint while still merging rows from separate display endpoints.

# Bookmap Plugin

Display-only Bookmap add-on for drawing RS Levels overlays from the local API.

## Status

Initial Java add-on source is included at:

```text
plugins/bookmap/src/main/java/com/rslevels/bookmap/RSLevelsDisplayBookmap.java
```

It registers a display-only horizontal level indicator and polls the local
service from a background worker.

## Recommended API Path

```text
GET /status
GET /levels/ES?format=rows
GET /levels/NQ?format=rows
```

The add-on parses the generic display rows because that export is compact,
stable, and easy for chart-plugin runtimes to consume.

Rows are `name,price,red,green,blue,kind`. The add-on remains compatible with
the original first five columns and uses the optional `kind` column when present
so bull zones, bear zones, HP, MHP, DD bands, references, and open/close levels
land in distinct Bookmap color slots.

## Add-On Settings

- service URL: JVM system property `rslevels.serviceUrl`, default `http://127.0.0.1:8765`
- symbol mapping: JVM system property `rslevels.symbol`, default inferred from the Bookmap alias
- refresh interval: JVM system property `rslevels.refreshMs`, default `1000`
- stale threshold: JVM system property `rslevels.staleSeconds`, default `82800`

## Rendering

- Polls `GET /status` and `GET /levels/:symbol?format=rows`.
- Draws up to 500 horizontal level markers through Bookmap indicator value lines.
- Uses the optional `kind` column for category-aware colors, including separate
  bull and bear zone colors.
- Clears displayed lines after stale/offline data exceeds the configured threshold.
- Logs feed availability warnings through Bookmap's logging API.

## Safety Boundary

This plugin must be display-only. It must not call Bookmap trading, position, account, order, cancellation, or flatten APIs.

The shared plugin test reads the source file and fails if platform trading API terms appear in the implementation.

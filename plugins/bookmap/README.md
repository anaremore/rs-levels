# Bookmap Plugin

Display-only Bookmap add-ons for drawing RS Levels overlays and VARIS Zones from the local API.

## Status

Initial Java add-on sources are included at:

```text
plugins/bookmap/src/main/java/com/rslevels/bookmap/RSLevelsDisplayBookmap.java
plugins/bookmap/src/main/java/com/rslevels/bookmap/VARISZonesBookmap.java
```

`RSLevelsDisplayBookmap.java` registers display-only horizontal level indicators and polls the local service from a background worker. `VARISZonesBookmap.java` registers display-only primary-chart line indicators, listens to one-minute Bookmap bars, polls captured `RI`, and publishes VWAP plus half/full RI bands.

## Recommended API Path

```text
GET /status
GET /levels/ES?format=rows
GET /levels/NQ?format=rows
GET /stats/ES?format=rows
GET /stats/NQ?format=rows
```

The add-on parses the generic display rows because that export is compact,
stable, and easy for chart-plugin runtimes to consume.

Rows are `name,price,red,green,blue,kind`. The add-on remains compatible with
the original first five columns and uses the optional `kind` column when present
so bull zones, bear zones, HP, MHP, DD bands, references, open/close levels,
yellow lines, red lines, and CAT lines land in distinct Bookmap color slots.

Stats rows are `name,value` and can include `DD`, `Res`, `MRes`, `WRes`, and
`Map`. Bookmap exposes that display context in the indicator full name because
the public value-line API is optimized for horizontal price markers.

The VARIS add-on uses `GET /status` and `GET /stats/:symbol?format=rows`. It reads `RI` from the stats rows and falls back to a manual JVM property when no captured value is available.

## Add-On Settings

- service URL: JVM system property `rslevels.serviceUrl`, default `http://127.0.0.1:8765`
- symbol mapping: JVM system property `rslevels.symbol`, default inferred from the Bookmap alias
- refresh interval: JVM system property `rslevels.refreshMs`, default `1000`
- stale threshold: JVM system property `rslevels.staleSeconds`, default `82800`

VARIS-specific properties:

- manual Risk Interval fallback: `rslevels.varis.manualRi`, default `25.0`
- use captured `RI`: `rslevels.varis.useCapturedRi`, default `true`
- refresh interval: `rslevels.varis.refreshMs`, default `1000`
- request timeout: `rslevels.varis.timeoutMs`, default `1500`

## Rendering

- Polls `GET /status`, `GET /levels/:symbol?format=rows`, and `GET /stats/:symbol?format=rows`.
- Draws up to 500 horizontal level markers through Bookmap indicator value lines.
- Uses the optional `kind` column for category-aware colors, including separate
  bull zone, bear zone, yellow-line, red-line, and CAT colors.
- Shows DD/Res/MRes/WRes/Map context in the indicator full name when available.
- Clears displayed lines after stale/offline data exceeds the configured threshold.
- Logs feed availability warnings through Bookmap's logging API.

`VARISZonesBookmap.java` uses Bookmap's simplified `BarDataListener` at `Intervals.INTERVAL_1_MINUTE` to compute VWAP from bar VWAP/volume, then draws VWAP, upper/lower half-RI bands, and upper/lower full-RI bands as primary-chart indicators. The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`.

## Safety Boundary

This plugin must be display-only. It must not call Bookmap trading, position, account, order, cancellation, or flatten APIs.

The shared plugin test reads the source file and fails if platform trading API terms appear in the implementation.

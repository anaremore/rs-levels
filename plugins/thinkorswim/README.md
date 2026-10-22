# RS Levels Thinkorswim Study

This adapter is a display-only generated ThinkScript study. ThinkScript cannot make HTTP requests, so the browser extension generates and copies a complete study from its latest captured levels for one chart. The copy workflow does not require the local service.

## Install or refresh the study

1. Open RocketScooter with the desired chart visible and let the RS Levels extension capture fresh levels.
2. Open the RS Levels Capture extension popup.
3. Select one chart. The all-charts selection is not supported because each generated study belongs to one chart family or stock symbol.
4. Click **Copy Thinkorswim study**.
5. In Thinkorswim, open the thinkScript Editor for a custom chart study.
6. Replace the study source with the clipboard contents, save it, and add it to the matching chart.

Repeat the copy-and-replace steps when the captured levels change. The generated source includes its symbol, capture timestamp, and level count in a chart label so users can see which snapshot is installed.

The checked-in [`rs-levels.ts`](rs-levels.ts) file is a valid starter study with installation guidance. The generated study copied from the extension contains the actual levels.

## Display controls

Generated studies include inputs for:

- labels, capture status, and RI/Map display context;
- DD bands, HP, MHP, open/close, reference, yellow, red, and CAT levels;
- bull and bear zone boundaries and filled zone clouds;
- uncategorized levels and line weight.

Half Gap levels use a dashed line. Extension-generated studies use the standard RS Levels category colors.

## Direct endpoint

The local service remains optional tooling. When it is running, tools can retrieve an equivalent study from:

```text
GET /thinkorswim/:symbol
```

For example, `http://127.0.0.1:8765/thinkorswim/ES` returns a paste-ready ES-family study from the service's stored snapshot. ES/MES and NQ/MNQ aliases resolve to the same stored families.

## Freshness

Thinkorswim receives a frozen source snapshot. It does not poll the API, auto-refresh, or automatically clear stale levels. Check the capture timestamp shown by the study and copy a new study after refreshing RocketScooter levels.

## Safety Boundary

This integration is display-only. It does not place orders, manage trades, read broker state, or access a Thinkorswim account. Generated source contains captured display levels and display-context labels only.

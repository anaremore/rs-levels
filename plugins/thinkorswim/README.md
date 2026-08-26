# RS Levels Thinkorswim Study

This adapter is a display-only generated ThinkScript study. ThinkScript cannot make HTTP requests to the RS Levels local API, so the browser extension copies a complete study containing the latest captured levels for one chart.

## Install or refresh the study

1. Run the RS Levels local service and capture fresh RocketScooter levels.
2. Open the RS Levels Capture extension popup.
3. Select one chart. The all-charts selection is not supported because each generated study belongs to one chart family or stock symbol.
4. Click **Copy Thinkorswim study**.
5. In Thinkorswim, open the thinkScript Editor for a custom chart study.
6. Replace the study source with the clipboard contents, save it, and add it to the matching chart.

Repeat the copy-and-replace steps when the captured levels change. The generated source includes its symbol, capture timestamp, and level count in a chart label so users can see which snapshot is installed.

After installing or updating RS Levels, restart the local service once so the running process loads the Thinkorswim endpoint. Ordinary level refreshes do not require a service restart.

The checked-in [`rs-levels.ts`](rs-levels.ts) file is a valid starter study with installation guidance. The generated study copied from the extension contains the actual levels.

## Display controls

Generated studies include inputs for:

- labels, capture status, and display-context stats;
- DD bands, HP, MHP, open/close, reference, yellow, red, and CAT levels;
- bull and bear zone boundaries and filled zone clouds;
- uncategorized levels and line weight.

Half Gap levels use a dashed line. Other levels retain the captured color when available and otherwise use the standard RS Levels category color.

## Direct endpoint

Tools can retrieve the same source from:

```text
GET /thinkorswim/:symbol
```

For example, `http://127.0.0.1:8765/thinkorswim/ES` returns a paste-ready ES-family study. ES/MES and NQ/MNQ aliases resolve to the same stored families.

## Freshness

Thinkorswim receives a frozen source snapshot. It does not poll the API, auto-refresh, or automatically clear stale levels. Check the capture timestamp shown by the study and copy a new study after refreshing RocketScooter levels.

## Safety Boundary

This integration is display-only. It does not place orders, manage trades, read broker state, or access a Thinkorswim account. Generated source contains captured display levels and display-context labels only.

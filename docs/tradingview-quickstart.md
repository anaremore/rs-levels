# TradingView Quickstart

This is the short path for users who only want RocketScooter levels on TradingView.

You need two pieces:

- the `RS Levels Capture` browser extension
- the `RS Levels` TradingView indicator from `plugins/tradingview/rs-levels.pine`

The local API service is optional for this workflow. It is useful for diagnostics, API docs, and direct Sierra/NinjaTrader/Quantower/Bookmap plugins, but TradingView itself only needs a copied `RSLEVELS|2` payload.

## 1. Load The Extension

1. Open `chrome://extensions` in a Chromium-based browser.
2. Enable developer mode.
3. Choose `Load unpacked`.
4. Select one of these folders:
   - `apps/browser-extension` from this repository
   - `dist/rs-levels-0.0.0/apps/browser-extension` from a full release package
   - the extracted standalone `rs-levels-browser-extension` folder
5. Pin `RS Levels Capture` so the popup is easy to open.

## 2. Open RocketScooter

1. Open RocketScooter in the same browser profile.
2. Keep the current ES/MES and NQ/MNQ futures charts visible.
3. If RocketScooter was already open before loading or reloading the extension, click `Reconnect Tab` in the extension popup, then refresh RocketScooter data or reload the RocketScooter tab.

The extension captures futures display data from the visible RocketScooter charts. It ignores SPY, QQQ, watchlist rows, broker panels, account data, order-entry controls, and execution data.

## 3. Add Optional Manual RocketScooter Lines

RS Levels passes through display levels that RocketScooter exposes. It does not invent optional manual levels.

If you want these items to appear in TradingView, add or keep them visible on the matching RocketScooter futures chart before copying the payload:

- overnight HP and overnight MHP
- yellow lines
- red lines
- CAT lines

Add them on the current ES/MES or NQ/MNQ RocketScooter chart family you care about. ES-family captures apply to ES and MES charts; NQ-family captures apply to NQ and MNQ charts. After adding or changing a manual line, refresh/reconnect the RocketScooter tab if needed, then copy a fresh TradingView payload.

## 4. Add The TradingView Indicator

1. In TradingView, open a futures chart such as `ES1!`, `MES1!`, `NQ1!`, or `MNQ1!`.
2. Open Pine Editor.
3. Paste the contents of `plugins/tradingview/rs-levels.pine`.
4. Save the script.
5. Add it to the chart.

Leave `Chart family` on `Auto` unless the chart does not detect correctly. In `Auto`, ES and MES charts use the ES section of the payload, while NQ and MNQ charts use the NQ section.

## 5. Copy And Paste Levels

1. Open the `RS Levels Capture` popup on the RocketScooter tab.
2. Leave the symbol selector on `ES + NQ` when both families are available.
3. Click `Copy TradingView`.
4. Open the TradingView indicator settings.
5. Paste into `RS Levels Payload`.
6. Click `OK`.

One copied payload can carry both ES and NQ. You can paste the same payload into ES/MES and NQ/MNQ TradingView charts; each chart draws the matching family.

TradingView Pine cannot poll RocketScooter or localhost directly. When RocketScooter levels change, copy a fresh payload from the extension and paste it into the indicator again.

## What Should Appear

The indicator can draw:

- DD bands
- HP and MHP levels
- open, close, and Half Gap levels
- user-added yellow lines, red lines, and CAT lines
- bull and bear zone boundaries and fills
- a small stats panel with liquidity map and RI when RocketScooter exposes them

User-added lines appear only when they were added in RocketScooter and included in the latest capture.

## Troubleshooting

- `Copy TradingView` can still work when the popup says the local service is offline, because the extension tries its own latest RocketScooter page-reader capture first.
- If `Copy TradingView` says no extension-captured levels are available, click `Reconnect Tab`, then reload RocketScooter or refresh the chart data.
- If levels paste but do not draw, confirm the TradingView chart is an ES/MES or NQ/MNQ futures chart. If needed, set `Chart family` to `ES` or `NQ`.
- If the wrong family appears, copy the all-symbol `ES + NQ` payload again and leave `Chart family` on `Auto`, or force the intended family.
- If you need a support bundle or want to inspect API state, start the local service with `npm start`, then use `Copy Diagnostics` in the popup.

## Safety Boundary

The extension and TradingView indicator are display-only. They do not place orders, cancel orders, flatten positions, read account data, read PnL, or run trading automation.

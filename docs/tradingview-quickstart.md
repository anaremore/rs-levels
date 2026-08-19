# TradingView Quickstart

This is the short path for users who only want RocketScooter levels on TradingView. For other workflows, see [Getting started](getting-started.md).

You need two pieces:

- the `RS Levels Capture` browser extension
- the `RS Levels` TradingView indicator from `plugins/tradingview/rs-levels.pine`

The local API service is optional for this workflow. It is useful for diagnostics, API docs, and direct Sierra/NinjaTrader/Quantower/Bookmap plugins, but TradingView itself only needs an `RSLEVELS|2` payload handed off by the extension or pasted manually.

## 1. Load The Extension

In Chrome:

1. [Install RS Levels Capture from the Chrome Web Store](https://chromewebstore.google.com/detail/rs-levels-capture/jgfonimhhihgemjnejboonidkgplkiko).
2. Pin `RS Levels Capture` so the popup is easy to open.

For development builds or Chromium browsers that cannot use the Chrome Web Store, open the browser's extensions page, enable developer mode, choose `Load unpacked`, and select `apps/browser-extension`, `dist/rs-levels-0.0.0/apps/browser-extension`, or the extracted `dist/rs-levels-browser-extension-<extension-version>.zip` folder.

In Firefox Desktop 140 or newer:

1. Run `npm run package`, open `about:debugging`, and choose `This Firefox`.
2. Choose `Load Temporary Add-on` and select `dist/rs-levels-browser-extension-firefox-<extension-version>.zip` or its extracted root `manifest.json`.
3. Pin `RS Levels Capture` so the popup is easy to open.

Firefox removes temporary add-ons on restart. A permanent Firefox install requires an add-on signed by Mozilla.

## 2. Open RocketScooter

1. Open RocketScooter in the same browser profile.
2. Keep the futures or stock charts you want to capture open in the RocketScooter chart grid.
3. If RocketScooter was already open before loading or reloading the extension, click `Reconnect Tab` in the extension popup, then refresh RocketScooter data or reload the RocketScooter tab.

The extension captures supported display data from open RocketScooter charts. Futures keep their complete RS Levels capture. Stock charts can provide HP, MHP, and liquidity-map context. Watchlist rows alone are ignored, as are broker panels, account data, order-entry controls, and execution data.

## 3. Review Automatic And Optional RocketScooter Lines

RocketScooter now adds the futures overnight levels automatically as `Dyn MHP` and `Dyn HP`; RS Levels captures and preserves those names. Existing manually added `OVNMHP` and `OVNHP` lines remain supported for compatibility.

If you want these optional manual items to appear in TradingView, add or keep them visible on the matching RocketScooter chart before sending the payload:

- yellow lines
- red lines
- CAT lines

For futures, keep `Dyn MHP` and `Dyn HP` visible on the ES/MES or NQ/MNQ chart family you care about. Legacy `OVNHP` or `OVNMHP` lines continue to pass through, including multiple distinct prices; exact duplicate label-and-price captures are shown once. For a stock such as NVDA, keep its stock chart open so detected HP, MHP, and map context can be included. After changing a chart or manual line, refresh/reconnect the RocketScooter tab if needed, then send a fresh TradingView payload.

## 4. Add The TradingView Indicator

1. In TradingView, open the matching chart, such as `NVDA`, `ES1!`, `MES1!`, `NQ1!`, or `MNQ1!`.
2. Open Pine Editor.
3. Paste the contents of `plugins/tradingview/rs-levels.pine`.
4. Save the script.
5. Add it to the chart.

Leave `Chart family` on `Auto`. Stock charts match their ticker section; ES/MES charts use `ES`, and NQ/MNQ charts use `NQ`. The manual ES/NQ choices are futures overrides.

Leave `Labels` enabled to show plain, color-matched labels at the right endpoint of each level line, or disable it to show only the lines and fills.

## 5. Send Levels

1. Keep the TradingView chart with the RS Levels indicator open in the same browser profile.
2. Open the `RS Levels Capture` popup.
3. Choose the detected RocketScooter chart you want, or `All charts (N)` when more than one supported chart is open.
4. Click `Send to TradingView`.
5. On first use, approve access to `https://*.tradingview.com/*`. The extension does not receive this access until you approve it.
6. If several TradingView chart tabs are open, choose the target and click `Send to TradingView` again.
7. The extension focuses that chart. If its indicator settings are already open, the payload fills immediately; otherwise open the settings within 45 seconds.
8. Review `RS Levels Payload`, then click `OK` yourself.

One payload can carry multiple detected tickers and futures families. Send it to each matching TradingView chart; each chart draws its own section in `Auto`.

`Copy payload instead` is always available and uses the original clipboard workflow: copy, open the indicator settings, paste into `RS Levels Payload`, and click `OK`.

TradingView Pine cannot poll RocketScooter or localhost directly. When RocketScooter levels change, send a fresh payload from the extension.

![RS Levels TradingView indicator overlay](../screenshots/tradingview-levels.png)

When the paste is working, the chart should show the display-only RS Levels overlay: DD bands, HP/MHP, user-added yellow/red/CAT lines, open/close references, bull and bear zones, and the small map/RI panel.

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

- Both TradingView actions can still work when the popup says the local service is offline, because the extension tries its latest RocketScooter page-reader capture first.
- If no extension-captured levels are available, click `Reconnect Tab`, then reload RocketScooter or refresh the chart data.
- If TradingView access is declined, use `Copy payload instead`; send never silently falls back to the clipboard.
- If the helper cannot find `RS Levels Payload`, open the indicator settings and send again. Use the copy fallback if TradingView's dialog markup has changed.
- If stock levels paste but do not draw, confirm the TradingView ticker exactly matches the detected RocketScooter ticker and leave `Chart family` on `Auto`.
- If futures levels paste but do not draw, confirm the chart is ES/MES or NQ/MNQ. If needed, force `ES` or `NQ`.
- If you need a support bundle or want to inspect API state, start the local service with `npm start`, then use `Copy Diagnostics` in the popup.

## Safety Boundary

The extension and TradingView indicator are display-only. The optional helper inserts one validated payload into one visible, exactly labelled settings field; it never clicks `OK` or interacts with chart/execution controls. They do not place orders, cancel orders, flatten positions, read account data, read PnL, or run trading automation. Confirm that extension-assisted input is permitted by the TradingView terms that apply to your use before enabling access.

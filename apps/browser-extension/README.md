# Browser Extension

For help choosing a workflow, see [Getting started](../../docs/getting-started.md). For the shortest TradingView-only workflow, see [TradingView quickstart](../../docs/tradingview-quickstart.md). For the full local API workflow, see [User setup](../../docs/user-setup.md).

Manifest V3 extension for Chrome/Chromium and Firefox Desktop 140+ that performs allowlisted RocketScooter response capture and display-only chart-level/context reading. The popup can send or copy TradingView data and locally generate a paste-ready Thinkorswim study. The runtime source is shared: entry points use `browser.*` when Firefox provides it and fall back to `chrome.*` in Chromium. Separate manifests account for the browsers' different Manifest V3 background declarations.

Capture code runs only on RocketScooter app host patterns (`rocket.place` and `rocketscooter.com`), injects a page hook at `document_start`, observes fetch/XHR responses, and forwards only URL-allowlisted response bodies to the local RS Levels service. It also injects a frame-aware display-only page reader that polls the TradingView chart objects currently open in RocketScooter. Futures keep their existing levels and context; stock charts can export detected HP, MHP, and liquidity-map data. TradingView access is separate and optional: a one-shot isolated helper is injected into a selected open TradingView chart only after the user clicks `Send to TradingView` and grants the exact site permission.

The page hook skips clearly non-text response content types before reading a body. Empty content types are allowed because some browser API responses omit the header.

## Install In Chrome Or Chromium

For normal Chrome use, [install RS Levels Capture from the Chrome Web Store](https://chromewebstore.google.com/detail/rs-levels-capture/jgfonimhhihgemjnejboonidkgplkiko) and pin it for quick access.

For development builds or Chromium browsers that cannot use the store:

1. Open `chrome://extensions` or the equivalent Chromium extension page.
2. Enable developer mode.
3. Load `apps/browser-extension` as an unpacked extension.
4. Start the local service with `npm start`.
5. Open RocketScooter and use the extension popup to check status.

Packaged releases include `dist/rs-levels-browser-extension-<extension-version>.zip`. Unzip it and load the extracted folder with `Load unpacked`.

## Install Temporarily In Firefox

Firefox Desktop requires version 140 or newer. Firefox for Android is not currently a supported or validated target. The Firefox manifest declares the `browsingActivity` and `websiteContent` data categories so Firefox can show its built-in consent disclosure during installation.

1. Run `npm run package`.
2. Open `about:debugging` in Firefox Desktop 140 or newer.
3. Choose `This Firefox`, then `Load Temporary Add-on`.
4. Select `dist/rs-levels-browser-extension-firefox-<extension-version>.zip`. You can also extract that ZIP and select its root `manifest.json`.
5. Start the local service with `npm start`, open RocketScooter, and check the extension popup.

A temporary Firefox installation is removed when Firefox restarts. Permanent Firefox distribution requires an add-on signed by Mozilla; the packaged ZIP is the source package for that signing flow, not a permanently installable unsigned add-on.

Both standalone ZIPs contain only the correct browser manifest, icon assets, README, and runtime `src/` files. Do not load `manifest.firefox.json` directly in Chrome or submit the Chrome ZIP to Firefox.

## Popup

The popup keeps the normal TradingView workflow visible and moves support utilities behind `Tools & diagnostics`. Its header summarizes capture readiness and detected-chart count; local service and build details stay available without competing with the primary action. The popup includes:

- detected-chart selector
- `Send to TradingView`
- `Copy payload instead`
- `Copy Thinkorswim study`
- collapsed `Tools & diagnostics` with `Reconnect Tab`, `Copy Diagnostics`, `API Docs`, `Plugins`, and the options shortcut
- nested technical details with local service/build identity, aggregate observed, ignored, skipped, and posted counters, hook status reason, and manual status refresh

Capture runs automatically on the RocketScooter hosts declared by the extension. The public [privacy policy](../../docs/privacy-policy.md) explains which RocketScooter data is handled, where it is sent, and what is excluded.

The selector contains only symbols with supported data in RocketScooter charts that are currently open; it does not copy the platform watchlist into a long dropdown. When several charts are available, `All charts (N)` bundles them in one payload. `Send to TradingView` asks for `https://*.tradingview.com/*` access on first use, lets the user choose when several chart tabs are open, focuses the selected chart, and fills only the visible input identified by the exact accessible label `RS Levels Payload` or by that exact visible label in the same settings row. If settings are not open yet, the helper waits for up to 45 seconds. It never clicks `OK`; review the value and confirm it yourself. `Copy payload instead` keeps the original clipboard workflow. Both TradingView actions use the latest detected-chart capture first, including stock HP/MHP and liquidity-map context; ES/NQ can still fall back to the local `/tradingview/:symbol` endpoint. `Copy Thinkorswim study` requires one selected chart and generates complete source inside the extension for replacement in the thinkScript Editor. `Reconnect Tab` attaches the capture hook to the active RocketScooter tab if the extension was loaded after the page was already open. `Copy Diagnostics` copies a scrubbed support bundle from `/diagnostics` plus extension post timing and the page reader's diagnostics (the extension's part is copied even when the local service is down). `API Docs` opens the local `/docs` page, and `Plugins` opens `/plugins`.

If the local service is offline, the TradingView and Thinkorswim chart exports still work from the extension's latest page-reader capture. The sanitized snapshot is kept only in extension `storage.session`, so it does not survive a browser restart or extension update. Refresh RocketScooter after opening, closing, or changing a chart so the detected selector and payload are fresh.

Restart the local service after service-side updates only when using API docs or direct API tools. Extension-generated TradingView and Thinkorswim exports do not require a service restart.

Capture is not limited by the selected popup export. The extension posts every allowlisted response it observes, while popup choices come only from the page reader's open-chart snapshot. Futures payload sections use `ES` and `NQ`; stock sections use their ticker, such as `NVDA`.

The page-reader fallback posts a synthetic `/page-reader/display` capture through the same local ingest endpoint. It emits generic display levels plus compatibility arrays named `chartLines`, `referenceLines`, and `zoneRectangles`. It runs in RocketScooter child frames as well as the top page so embedded chart objects are visible. Futures retain automatic `Dyn MHP`/`Dyn HP`, legacy `OVNMHP`/`OVNHP`, DD, RI, Res, MRes, WRes, zones, references, and other manual-line behavior. For a detected stock chart, the reader can export visible HP/MHP lines and the matching liquidity-map code without iterating the rest of the watchlist. It emits only chart symbols, display names, prices, public kind labels, colors, display stats, and small diagnostic metadata; it does not forward account, broker, execution, order-entry, raw DOM text, cookies, headers, or credentials.

Once a minute the page reader also reads the `NQ100` `Resilience` and `Arb` studies on the 1-minute NQ chart, and the `SP500` ones on the 1-minute ES chart, through the chart's own data export, and posts their plot values as a `/page-reader/series` capture of timestamped numbers. The first read, and one every half hour, sends everything the chart has loaded so the service's history backfills the day; the reads between send the last 15 minutes. It is read-only: it never adds, removes, or changes a study. Charts at any other resolution are skipped (daily charts carry an all-zero Resilience study), as are rows after the current time, empty values, and the zero line. The chart's clock is judged from its newest candle: each read also exports the chart's main series for the last hour (`includeSeries`, no studies) and takes the newest row that carries a real trade. Only the main series' columns count (the export's first series source; never a column whose `sourceId` is a study on that chart, nor a second series source such as an overlay). A row counts as a candle only when it has volume above zero, where the feed gives volume (a feed whose volume is always empty is judged by its prices), and prices that are neither the last candle's close carried forward nor an exact repeat of the last candle (every price, and volume when given). Whitespace rows past the last candle (NaN, the last close carried, or the last bar repeated) never count, so a chart whose real candles are ahead is still a fault and one whose export only runs on ahead is not. Study rows never judge it, since a study or shape drawn with a forward offset runs the export's time column past the last candle on a chart whose clock is right (those rows, like every row after now, are still dropped). If that candle read fails, nothing from the chart is stored that read and the last clock judgment stands (a new fault is never claimed from it); only an export with no main-series columns at all falls back to the studies' newest row that has a value (a row that is only a time is not a bar). A chart whose newest candle is more than 2 minutes after the current time has a broken clock (the page logs `putToCacheNewBar: time violation`, and its studies' past rows are zero placeholders): nothing from that chart is stored, the reason is `series-chart-clock` with `seriesClockSymbol` and `seriesClockSkewS` in the diagnostics, and the popup's diagnostics say "NQ chart clock is off; reload the page". Its full read stays due, so the day backfills once the page is reloaded. Each minute read also keeps what it saw of every 1-minute ES/NQ chart's clock in `seriesClockCharts` (at most 4 charts, local only: the popup and `Copy Diagnostics`, never posted): the chart's `index` in the layout, its `chart` symbol, `resolution`, whether it is the `active` chart, `source` (`candles`, `studies` for the fallback, `failed`, or `no-export`), `candleS`/`candleAt` (the candle time used), `studyS`/`studyAt` (the studies' newest valued row), `skewS` (that time minus now; `seriesClockNowS` is now), the export's `rows`, rows `ahead` of now and rows `skipped` as no trade, its first 8 `columns` (`type` = `sourceType`, `id` = `sourceId`, `title` = `plotTitle`), and its last 5 rows as `tail` (time, then OHLC and volume; `null` for no number). The popup's `Technical details` show one line per chart under `Clocks`, for example `F.US.ENQZ26 #0 active 1m: candles 17:24:00Z (+0 s)`. Each study keeps its own full-read clock, so a study missing from the chart never makes the others re-send everything. A missing chart, study, or widget is only counted in diagnostics (`seriesMissingCount`, `seriesErrorCount`, `seriesTooLargeCount`, `seriesLastReason`), and series posts don't change the popup's post count or time; level capture is unaffected, and the service's `/status` shows the series as no longer fresh.

A fast path keeps the newest bars moving: about once a second (the options page's "Resilience and Arb update interval", default 1000 ms, minimum 500), the reader exports only the last two bars of each study on those 1-minute charts and posts a `/page-reader/series-live` capture (`rs_series_live`) with only the values that changed since its last post. The service streams them at once (`GET /series/:symbol/stream`) and stores each bar only when its minute has ended. The fast path reads only charts whose clock the last minute read judged right, checks the clock again itself from the candles, and posts nothing from a chart whose clock is off until a minute read judges it right again. The two never export at the same time (each waits for the other). Every 10 seconds it sends its bars whole, not just the changes, so a post lost on the way (a service restart) is made good. A clock fault it finds shows in the popup at once. Its diagnostics are `seriesLiveReadCount`, `seriesLivePublishedCount`, `seriesLiveErrorCount`, `seriesLiveLastReason` and `seriesLiveLastPublishedAt`.

If the popup remains waiting, `Hook: hook-installed` or `Hook: settings-synced` means the page hook is alive and waiting for RocketScooter traffic. `Observed: 0` means the hook has not seen fetch/XHR responses yet; use `Reconnect Tab`, then reload RocketScooter data or the tab so startup requests run with the hook installed.

## Options

Options let users configure:

- local service URL, default `http://127.0.0.1:8765`
- endpoint URL allowlist
- max capture size
- Resilience and Arb update interval (ms): the series fast path, default 1000, minimum 500
- service reachability test
- browser origin permission status for the configured service URL

Existing extension settings migrate to the current display-feed allowlist. Version 0.4.4 removes the obsolete capture pause setting so upgraded installs resume the extension's core capture behavior automatically.

For Tailscale/private-network use, point the service URL at the trusted machine after the local service has been explicitly started with remote access enabled. The browser will ask for permission to reach that specific origin.

## Safety Boundary

The extension does not store credentials, forward request auth data, read arbitrary page text, or include trading/execution automation. It forwards response bodies only when their URL matches the configured allowlist. The page-reader fallback reads only TradingView chart object metadata needed for display levels and display stats. The optional TradingView helper searches visible page markup only for the exact static `RS Levels Payload` label and nearby writable text controls, requires one unambiguous match, inserts the frozen validated payload, and then stops; it does not retain or transmit page text, scrape chart data, use TradingView storage, or submit the dialog. TradingView matcher diagnostics contain only bounded counters and fixed reason codes. The extension's broader support diagnostics are scrubbed and do not include ignored URLs, headers, cookies, bodies, field values, or page text. Confirm that extension-assisted input is permitted by the TradingView terms that apply to your use before enabling access.

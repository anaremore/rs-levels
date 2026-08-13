# RS Levels Capture Privacy Policy

Effective date: August 13, 2026

RS Levels Capture is a local-first browser extension that transfers RocketScooter display-level data from a user's browser session to RS Levels display tools. This policy applies to the RS Levels Capture extension for Chrome/Chromium and Firefox.

## Data the extension handles

On the RocketScooter hosts declared during extension installation, the extension handles:

- website content from RocketScooter responses whose URLs match the user's endpoint allowlist, including the response URL, endpoint path, HTTP method and status, capture time, and response body;
- visible chart-level metadata for supported charts already open in RocketScooter, including chart symbols, level labels and prices, display colors, zones, and limited display statistics;
- the user's extension settings, including endpoint allowlist, maximum capture size, and local or private RS Levels service URL;
- the addresses of supported RocketScooter pages and, only when the user starts a TradingView handoff, matching open TradingView chart tabs; and
- aggregate operational diagnostics such as observed, ignored, skipped, and posted counts and fixed error reason codes.

The extension is not designed to read or transmit cookies, authorization headers, passwords, unrelated form inputs, complete browser history, screenshots, order-entry data, positions, balances, or profit-and-loss data.

The Firefox manifest declares Mozilla's `browsingActivity` and `websiteContent` categories because the extension handles supported page and response URLs plus allowlisted response/chart content. This declaration does not broaden collection; Firefox shows the categories during installation.

## How data is used

The extension uses this data only to provide its single purpose: capture display-level data from the user's RocketScooter session and make it available to the user's RS Levels displays.

Matching response data and sanitized chart metadata are sent only to the RS Levels service URL configured by the user. The default service URL is on the user's own computer at `http://127.0.0.1:8765`. The user may explicitly configure a trusted private-network service and must grant that exact origin when prompted.

The extension does not send captured data to the developer, an advertising service, an analytics service, or another developer-controlled server.

If the user explicitly chooses Send to TradingView, the extension asks for TradingView site access, places one frozen, validated levels payload into the visible `RS Levels Payload` field of a selected TradingView chart, and stops. The extension does not submit the dialog. The user reviews the value and decides whether to confirm it.

## Storage and retention

Extension settings are stored in browser-managed extension local storage until the user resets them or removes the extension.

The latest sanitized chart snapshot may be stored in browser-managed extension session storage. It is cleared when the browser session ends or the extension is updated. Raw RocketScooter response bodies are not stored in extension session storage.

The separately installed RS Levels local service controls any data it receives. By default it runs on the user's device, keeps current display data locally, and does not send data to the developer. Users can delete local service data by removing its local data files or uninstalling the service.

## Sharing and sale

RS Levels Capture does not sell user data. It does not use or transfer user data for advertising, creditworthiness, lending, or unrelated purposes. The developer does not allow humans to read captured user data because the extension does not transmit that data to the developer.

Data reaches a third-party page only when the user explicitly starts the TradingView handoff described above. Users remain responsible for the terms and privacy practices of RocketScooter, TradingView, and any private service destination they configure.

## User choices and deletion

Users can disable or remove the extension to stop capture and can manage RocketScooter site access in browser extension settings where the browser supports it. They can avoid TradingView access and use the explicit copy-to-clipboard workflow instead. Optional site access can be removed in the browser's extension settings.

Removing the extension deletes its browser-managed local and session storage. Removing local RS Levels service data deletes data held by that separate local component.

## Security

The default extension-to-service connection remains on the user's computer. Private-network destinations are chosen by the user and require an explicit site-permission grant. The extension does not execute remotely hosted code.

## Limited Use

For Chrome distribution, use of information received through extension permissions complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Across supported browsers, data is used only to provide or improve the extension's disclosed, user-facing single purpose.

## Children

The extension is not directed to children under 13 and does not knowingly collect children's personal information.

## Changes

Material changes to these practices will be reflected in this policy and, when required, disclosed in the extension before new data handling begins. The effective date above will be updated.

## Contact

For privacy questions or requests, open an issue at https://github.com/anaremore/rs-levels/issues. Do not include credentials, private captures, or other sensitive data in a public issue.

RS Levels Capture is an independent project and is not affiliated with or endorsed by RocketScooter or TradingView.

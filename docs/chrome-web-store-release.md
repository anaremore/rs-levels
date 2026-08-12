# Chrome Web Store Release Guide

This guide is the source of truth for Chrome Web Store releases of RS Levels Capture.

Published listing: [RS Levels Capture on the Chrome Web Store](https://chromewebstore.google.com/detail/rs-levels-capture/jgfonimhhihgemjnejboonidkgplkiko)

## Release artifacts

Build and verify:

```powershell
npm test
npm run scan:private
npm run scan:secrets
npm run package
```

Upload only:

```text
dist/rs-levels-browser-extension-0.4.3.zip
```

The ZIP must contain `manifest.json` at its root. Do not upload the full `rs-levels-0.0.0.zip` source release.

Dashboard artwork:

- Store icon: `store-assets/icon-128.png`
- Screenshot: `store-assets/screenshot-popup-1280x800.png`
- Small promo tile: `store-assets/small-promo-440x280.png`
- Marquee promo tile: `store-assets/marquee-promo-1400x560.png` (optional)

Before submission, install the ZIP in a fresh Chrome profile, confirm capture starts off, open and read the disclosure tooltip, opt in, and exercise every advertised flow.

## Item choice

Use **New item** for RS Levels Capture if no existing RS Levels Capture item exists. The rejected **Eat My Shorts!** entry shown in the dashboard is a different product and should not be reused.

If an existing rejected or draft item is actually an earlier RS Levels Capture submission, open that item and upload the corrected package there so its item ID and history are preserved.

## Store listing

**Product name**

```text
RS Levels Capture
```

**Summary**

```text
Capture RocketScooter chart levels and send them to TradingView or your local RS Levels tools.
```

The summary is 94 characters and matches the manifest description.

**Category**

```text
Productivity
```

**Language**

```text
English
```

**Detailed description**

```text
RS Levels Capture brings your RocketScooter levels into TradingView and other supported charting platforms.

Use the same levels you already follow in RocketScooter without manually recreating them on every chart. The extension detects supported RocketScooter charts and prepares the level data for your preferred RS Levels display.

Key features:
• Display RocketScooter levels directly on TradingView charts
• Send levels to TradingView in a few clicks—no manual data entry
• Automatically detect supported RocketScooter charts
• Choose a specific chart or send all detected charts
• Use the same captured levels with Sierra Chart, NinjaTrader, Quantower, Bookmap, and other RS Levels integrations
• Copy a validated payload whenever you prefer a manual workflow
• Keep data local by default with the optional RS Levels service

TradingView integration is simple: open the RS Levels indicator settings, click “Send to TradingView” in the extension, and review the populated payload before applying it.

Capture is off until you enable it. The extension does not read cookies, passwords, authorization headers, or unrelated form inputs, and captured data is not sent to the extension developer.

Requirements:
• Your own RocketScooter access
• A compatible RS Levels indicator or platform integration

RS Levels Capture provides display-data transport only. It does not provide trading advice, recommendations, order entry, or broker automation.

RS Levels Capture is an independent project and is not affiliated with or endorsed by RocketScooter or TradingView.
```

**URLs**

- Homepage: https://github.com/anaremore/rs-levels
- Support: https://github.com/anaremore/rs-levels/issues
- Privacy policy: https://github.com/anaremore/rs-levels/blob/main/docs/privacy-policy.md

Push the privacy policy to the public `main` branch and open the URL in a signed-out browser before submitting.

## Privacy practices

**Single purpose**

```text
Capture display-level data from the user's RocketScooter browser session and make it available to the user's RS Levels display tools.
```

**Permission justifications**

`storage`

```text
Stores the user's local service URL, capture opt-in state, endpoint allowlist, and maximum capture size in extension-local storage. A sanitized latest chart snapshot is kept only in session storage so explicit copy and TradingView handoff actions can use current display data.
```

`clipboardWrite`

```text
Writes a levels payload or scrubbed diagnostics to the clipboard only after the user clicks Copy payload or Copy Diagnostics.
```

`scripting`

```text
Injects bundled extension scripts into a user-selected supported tab for Reconnect Tab and the explicit Send to TradingView handoff. No downloaded or remote code is executed.
```

Required RocketScooter host access

```text
Runs the capture hook and display-only chart reader only on rocket.place and rocketscooter.com. When the user has opted in, this access is required to read allowlisted display-data responses and chart-level metadata for the extension's single purpose.
```

Required localhost host access

```text
Connects to the RS Levels service on 127.0.0.1 or localhost to post captured display data, read health and status, and open local API documentation.
```

Optional `http://*/*` and `https://*/*` host access

```text
Supports a user-entered local or trusted private-network RS Levels service and the optional TradingView handoff. The broad patterns only declare which origins may be requested; the extension asks at runtime for the exact user-entered service origin or the TradingView chart origin, and only after the user initiates that feature.
```

**Remote code**

Select:

```text
No, I am not using remote code.
```

All executable JavaScript is included in the uploaded ZIP. Response bodies and chart data are treated as data and are never evaluated as code.

**Data types**

Select:

- **Website content** — allowlisted RocketScooter response bodies and visible chart-level metadata are processed after opt-in.
- **Web history** — the extension handles supported RocketScooter response URLs and, for an explicit handoff, matching currently open TradingView chart URLs. It does not read or retain the user's general browser history.

Do not select financial/payment information merely because the payload contains market display levels; the extension does not handle a user's payment details, balances, positions, or transactions. If production testing proves otherwise, stop and update the code, disclosure, and privacy policy before submission.

Certify all Limited Use statements only after confirming the uploaded build matches `docs/privacy-policy.md`.

## Distribution

Choose visibility and regions deliberately. For the first review, deferred publishing is recommended so approval does not immediately make the item public. After approval, Chrome allows a limited staging window before the draft must be reviewed again.

The extension is free and requires separately obtained RocketScooter access. Do not imply that RocketScooter or TradingView is included.

## Reviewer test instructions

The core feature runs on authenticated RocketScooter pages. Create a dedicated, non-production reviewer account with no real trading credentials or private customer data, and enter its credentials only in the dashboard's protected test-instructions fields. Never commit them to this repository.

Paste and complete this template:

```text
Prerequisite: use the dedicated Chrome Web Store reviewer account supplied below. It contains synthetic/display-only data and no brokerage connection.

1. Install RS Levels Capture 0.4.3.
2. Open the extension popup. Confirm capture is OFF and the disclosure is available from the info tooltip beside the toggle.
3. Sign in to RocketScooter using the reviewer credentials below and open a supported chart.
4. In the extension popup, enable RocketScooter capture. Refresh the RocketScooter chart so the capture hook sees startup responses.
5. The popup should list the detected chart. The local-service status may remain offline unless the optional local service is running.
6. Click Copy payload instead to verify the user-initiated clipboard path.
7. Optional TradingView test: open a TradingView chart with the RS Levels indicator settings dialog visible, click Send to TradingView, approve the exact TradingView site permission, and confirm the RS Levels Payload field is filled but the dialog is not submitted.

Reviewer username: [ENTER ONLY IN DASHBOARD]
Reviewer password: [ENTER ONLY IN DASHBOARD]

No brokerage, order-entry, payment, or two-factor-authentication workflow is required.
```

If a compliant reviewer account cannot be provided, do not submit yet; an inaccessible core workflow is a preventable review failure.

## Submission order

1. Push the final privacy policy and verify its public URL while signed out.
2. Run the complete verification and package commands.
3. Install the exact ZIP in a fresh Chrome profile and perform the manual test matrix.
4. Open the RS Levels Capture item, or choose **New item** if none exists.
5. Upload `dist/rs-levels-browser-extension-0.4.3.zip`.
6. Complete Store listing, Privacy practices, Distribution, and Test instructions using this guide.
7. Upload the icon, screenshot, small promo tile, and optional marquee promo tile from `store-assets`.
8. Choose deferred publishing, submit for review, and monitor the account email for reviewer questions.
9. After approval, perform one final staged-package smoke test before publishing.

Do not submit the package until the dedicated reviewer account and the live manual test are complete.

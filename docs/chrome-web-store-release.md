# Chrome Web Store Release Guide

This guide is the source of truth for the first Chrome Web Store submission of RS Levels Capture.

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
dist/rs-levels-browser-extension-0.4.0.zip
```

The ZIP must contain `manifest.json` at its root. Do not upload the full `rs-levels-0.0.0.zip` source release.

Dashboard artwork:

- Store icon: `store-assets/icon-128.png`
- Screenshot: `store-assets/screenshot-popup-1280x800.png`
- Small promo tile: `store-assets/small-promo-440x280.png`

Before submission, install the ZIP in a fresh Chrome profile, confirm capture starts off, read the disclosure, opt in, and exercise every advertised flow.

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
Capture RocketScooter display levels and hand them to RS Levels displays.
```

The summary is 73 characters and matches the manifest description.

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
RS Levels Capture moves display-level data from your RocketScooter browser session into local RS Levels display tools.

Capture is off until you opt in. After you enable it, the extension reads allowlisted RocketScooter response bodies and visible chart-level metadata on supported RocketScooter sites. It sends captures to an RS Levels service URL you choose; localhost is the default. Captured data is not sent to the developer.

Key features:
• Detect display data for supported charts currently open in RocketScooter
• Feed local RS Levels display APIs and compatible platform plugins
• Copy a TradingView payload or, after an optional exact-site permission grant, fill the visible RS Levels Payload field for review
• Pause capture at any time and inspect scrubbed connection diagnostics
• Configure the endpoint allowlist, capture size, and a trusted local or private service URL

Requirements:
• Your own RocketScooter access
• The separately installed RS Levels local service for API and plugin workflows
• A compatible RS Levels TradingView indicator for the optional handoff

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

1. Install RS Levels Capture 0.4.0.
2. Open the extension popup. Confirm capture is OFF and the disclosure is visible.
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
5. Upload `dist/rs-levels-browser-extension-0.4.0.zip`.
6. Complete Store listing, Privacy practices, Distribution, and Test instructions using this guide.
7. Upload the icon, screenshot, and small promo tile from `store-assets`.
8. Choose deferred publishing, submit for review, and monitor the account email for reviewer questions.
9. After approval, perform one final staged-package smoke test before publishing.

Do not submit the package until the dedicated reviewer account and the live manual test are complete.

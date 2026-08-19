const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const firefoxManifest = JSON.parse(readFileSync(join(root, 'manifest.firefox.json'), 'utf8'));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, '0.4.5');
assert.equal(manifest.description, 'Capture RocketScooter chart levels and send them to TradingView or your local RS Levels tools.');
assert.deepEqual(manifest.icons, {
  16: 'assets/icon-16.png',
  32: 'assets/icon-32.png',
  48: 'assets/icon-48.png',
  128: 'assets/icon-128.png'
});
assert.deepEqual(manifest.action.default_icon, { 16: 'assets/icon-16.png', 32: 'assets/icon-32.png' });
assert.equal(manifest.background.service_worker, 'src/background.js');
assert.equal(firefoxManifest.manifest_version, 3);
assert.equal(firefoxManifest.version, manifest.version);
assert.deepEqual(firefoxManifest.background.scripts, ['src/shared.js', 'src/background.js']);
assert.equal(firefoxManifest.background.service_worker, undefined);
assert.deepEqual(firefoxManifest.browser_specific_settings, {
  gecko: {
    id: 'rs-levels-capture@rs-levels.local',
    strict_min_version: '140.0',
    data_collection_permissions: {
      required: ['browsingActivity', 'websiteContent']
    }
  }
});
for (const key of [
  'name',
  'description',
  'icons',
  'permissions',
  'host_permissions',
  'optional_host_permissions',
  'action',
  'options_page',
  'content_scripts',
  'web_accessible_resources'
]) {
  assert.deepEqual(firefoxManifest[key], manifest[key], `Firefox ${key} should match Chrome`);
}
assert.deepEqual(manifest.permissions.sort(), ['clipboardWrite', 'scripting', 'storage']);
assert.ok(!JSON.stringify(manifest).includes('<all_urls>'));
assert.ok(!JSON.stringify(manifest).includes('webRequest'));
assert.ok(!JSON.stringify(manifest).includes('debugger'));
assert.ok(!JSON.stringify(manifest.host_permissions).includes('http://*/*'));
assert.ok(!JSON.stringify(manifest).includes('tabs'));
assert.deepEqual(manifest.optional_host_permissions.sort(), ['http://*/*', 'https://*/*']);
assert.doesNotMatch(JSON.stringify(manifest.content_scripts), /tradingview\.com/);
assert.ok(manifest.host_permissions.includes('https://rocket.place/*'));
assert.ok(manifest.host_permissions.includes('https://*.rocket.place/*'));
assert.ok(manifest.host_permissions.includes('https://rocketscooter.com/*'));
assert.ok(manifest.host_permissions.includes('https://*.rocketscooter.com/*'));
assert.ok(manifest.content_scripts[0].matches.includes('https://rocket.place/*'));
assert.ok(manifest.content_scripts[0].matches.includes('https://*.rocket.place/*'));
assert.ok(manifest.content_scripts[0].matches.includes('https://rocketscooter.com/*'));
assert.ok(manifest.content_scripts[0].matches.includes('https://*.rocketscooter.com/*'));
assert.equal(manifest.content_scripts[0].run_at, 'document_start');
assert.equal(manifest.content_scripts[0].all_frames, true);
assert.equal(manifest.content_scripts[0].match_about_blank, true);
assert.deepEqual(manifest.content_scripts[0].js, ['src/shared.js', 'src/content-script.js']);
assert.ok(manifest.content_scripts[1].matches.includes('https://rocket.place/*'));
assert.ok(manifest.content_scripts[1].matches.includes('https://*.rocket.place/*'));
assert.ok(manifest.content_scripts[1].matches.includes('https://rocketscooter.com/*'));
assert.ok(manifest.content_scripts[1].matches.includes('https://*.rocketscooter.com/*'));
assert.deepEqual(manifest.content_scripts[1].js, ['src/capture-rules.js', 'src/page-hook.js', 'src/page-reader.js']);
assert.equal(manifest.content_scripts[1].run_at, 'document_start');
assert.equal(manifest.content_scripts[1].world, 'MAIN');
assert.equal(manifest.content_scripts[1].all_frames, true);
assert.equal(manifest.content_scripts[1].match_about_blank, true);
assert.match(JSON.stringify(manifest.web_accessible_resources), /https:\/\/rocket\.place\/\*/);
assert.match(JSON.stringify(manifest.web_accessible_resources), /src\/capture-rules\.js/);
assert.match(JSON.stringify(manifest.web_accessible_resources), /src\/page-hook\.js/);
assert.match(JSON.stringify(manifest.web_accessible_resources), /src\/page-reader\.js/);

const contentScript = readFileSync(join(root, 'src', 'content-script.js'), 'utf8');
const tradingViewContent = readFileSync(join(root, 'src', 'tradingview-content.js'), 'utf8');
const pageHook = readFileSync(join(root, 'src', 'page-hook.js'), 'utf8');
const pageReader = readFileSync(join(root, 'src', 'page-reader.js'), 'utf8');
const background = readFileSync(join(root, 'src', 'background.js'), 'utf8');
const popup = readFileSync(join(root, 'src', 'popup.js'), 'utf8');
const popupHtml = readFileSync(join(root, 'src', 'popup.html'), 'utf8');
const popupCss = readFileSync(join(root, 'src', 'popup.css'), 'utf8');
const options = readFileSync(join(root, 'src', 'options.js'), 'utf8');
const optionsHtml = readFileSync(join(root, 'src', 'options.html'), 'utf8');
const optionsCss = readFileSync(join(root, 'src', 'options.css'), 'utf8');
const shared = readFileSync(join(root, 'src', 'shared.js'), 'utf8');

for (const source of [background, contentScript, tradingViewContent, popup, options]) {
  assert.match(source, /globalThis\.browser \?\? globalThis\.chrome/);
  assert.doesNotMatch(source, /\bchrome\./);
}

for (const match of popup.matchAll(/document\.getElementById\('([^']+)'\)/g)) {
  assert.match(popupHtml, new RegExp(`id="${match[1]}"`), `popup element #${match[1]} should exist`);
}

assert.match(contentScript, /rs-levels\.content-diagnostic/);
assert.match(contentScript, /settings-sent/);
assert.match(contentScript, /__RS_LEVELS_RECONNECT/);
assert.match(contentScript, /window\.location\.origin/);
assert.match(contentScript, /rs-levels\.capture-diagnostic/);
assert.match(contentScript, /migrateSettings/);
assert.match(contentScript, /__RS_LEVELS_CONTENT_SCRIPT_ACTIVE__/);
assert.match(pageHook, /__RS_LEVELS_PAGE_HOOK__/);
assert.match(pageHook, /hook-installed/);
assert.match(pageHook, /hook-reconnected/);
assert.match(pageHook, /event\.origin/);
assert.match(pageHook, /xhr\.responseType/);
assert.match(pageHook, /isTextLikeContentType/);
assert.match(pageHook, /observedCount/);
assert.match(pageHook, /ignoredCount/);
assert.match(pageHook, /skippedEmptyCount/);
assert.match(pageReader, /__RS_LEVELS_PAGE_READER__/);
assert.match(pageReader, /reader-installed/);
assert.match(pageReader, /\/page-reader\/display/);
assert.match(pageReader, /type: 'rs_snapshot'/);
assert.match(pageReader, /chartLines/);
assert.match(pageReader, /referenceLines/);
assert.match(pageReader, /zoneRectangles/);
assert.match(pageReader, /tvWidget/);
assert.match(pageReader, /getAllShapes/);
assert.match(pageReader, /getAllStudies/);
assert.match(pageReader, /futuresSymbol/);
assert.match(pageReader, /chartDisplaySymbol/);
assert.match(pageReader, /readScannerDisplayData/);
assert.doesNotMatch(contentScript + pageHook + pageReader, /document\.body\.innerText/);
assert.doesNotMatch(contentScript + pageHook + pageReader, /document\.documentElement\.innerText/);
assert.doesNotMatch(background, /chrome\.cookies/);
assert.match(background, /typeof importScripts === 'function'/);
assert.match(background, /importScripts\('shared\.js'\)/);
assert.match(background, /\/capture\/api/);
assert.match(background, /cleanCaptureStats/);
assert.match(background, /content-diagnostic/);
assert.match(background, /migrateSettings/);
assert.match(background, /injectActiveTab/);
assert.match(background, /webext\.scripting\.executeScript/);
assert.match(background, /allFrames: true/);
assert.match(background, /world: 'MAIN'/);
assert.match(background, /isRocketScooterUrl/);
assert.match(background, /rocket\.place/);
assert.match(background, /rs-levels\.tradingview-payload/);
assert.match(background, /rememberTradingViewSnapshot/);
assert.match(background, /tradingViewPayloadResponse/);
assert.match(background, /detectedTradingViewSnapshot/);
assert.match(background, /detectedSymbols/);
assert.match(background, /webext\.storage\.session/);
assert.match(background, /rs-levels\.send-to-tradingview/);
assert.match(background, /rs-levels\.tradingview-tabs/);
assert.match(background, /detectedOnly/);
assert.match(background, /TRADINGVIEW_DETECTED_FRESH_MS/);
assert.match(background, /webext\.tabs\.onRemoved/);
assert.match(background, /webext\.tabs\.onUpdated/);
assert.match(background, /remove\('captureEnabled'\)/);
assert.match(background, /TRADINGVIEW_PERMISSION_ORIGIN/);
assert.match(background, /webext\.tabs\.query/);
assert.match(background, /files: \['src\/tradingview-content\.js'\]/);
assert.match(background, /frameIds: \[0\]/);
assert.match(background, /world: 'ISOLATED'/);
assert.match(tradingViewContent, /RS Levels Payload/);
assert.match(tradingViewContent, /BRIDGE_VERSION = 2/);
assert.match(tradingViewContent, /TRADINGVIEW_BRIDGE_VERSIONED/);
assert.match(background, /rs-levels\.tradingview-arm-v2/);
assert.match(tradingViewContent, /rs-levels\.tradingview-arm-v2/);
assert.match(tradingViewContent, /\[role="dialog"\]/);
assert.match(tradingViewContent, /MutationObserver/);
assert.match(tradingViewContent, /attributes: true/);
assert.match(tradingViewContent, /attributeFilter/);
assert.match(tradingViewContent, /SEMANTIC_LABEL_SELECTOR/);
assert.match(tradingViewContent, /collectExactLabelCandidates/);
assert.match(tradingViewContent, /createTreeWalker/);
assert.match(tradingViewContent, /findVisuallyAssociatedControl/);
assert.match(tradingViewContent, /getBoundingClientRect/);
assert.match(tradingViewContent, /control\.readOnly/);
assert.match(tradingViewContent, /span, div/);
assert.match(tradingViewContent, /Object\.getOwnPropertyDescriptor/);
assert.match(tradingViewContent, /InputEvent/);
assert.match(tradingViewContent, /aria-live/);
assert.match(tradingViewContent, /Review the input and click OK/);
assert.doesNotMatch(tradingViewContent, /\.click\s*\(/);
assert.doesNotMatch(tradingViewContent, /localStorage|sessionStorage/);
assert.doesNotMatch(tradingViewContent, /fetch\s*\(/);
assert.match(popup, /const ALL_SCOPE = 'ALL'/);
assert.match(popup, /exportScopes\(extState\.detectedSymbols\)/);
assert.match(popup, /detected\.length > 1 \? \[ALL_SCOPE, \.\.\.detected\] : detected/);
assert.doesNotMatch(popup, /defaults\.symbols/);
assert.doesNotMatch(popup, /availableFamilies/);
assert.match(popup, /extensionTradingViewPayloadResult/);
assert.match(popup, /TradingView data copied/);
assert.match(popup, /resolveTradingViewPayload/);
assert.match(popup, /result\.state === 'filled'/);
assert.match(popup, /RS Levels payload filled/);
assert.match(popup, /Waiting up to 45 seconds/);
assert.match(popup, /webext\.permissions\.request/);
assert.match(popup, /https:\/\/\*\.tradingview\.com\/\*/);
assert.match(popup, /rs-levels\.send-to-tradingview/);
assert.match(popup, /rs-levels\.tradingview-tabs/);
assert.match(popup, /detectedOnly: options\.detectedOnly === true/);
assert.match(popup, /webext\.tabs\.create/);
assert.match(popup, /setSending/);
assert.match(popup, /fetchTradingViewText/);
assert.doesNotMatch(popup, /format=json/);
assert.match(popup, /\/diagnostics/);
assert.match(popup, /\/plugins/);
assert.match(popup, /exportScopes/);
assert.match(popup, /No chart data detected/);
assert.match(popup, /publicDisplaySymbol/);
assert.match(popup, /cleanExtensionState/);
assert.match(popup, /renderCaptureStats/);
assert.doesNotMatch(popup, /toggleCapture|captureEnabled/);
assert.match(popup, /reconnectActiveTab/);
assert.match(popup, /renderTransferState/);
assert.match(popup, /tradingViewCopyIssue/);
assert.match(popup, /preferredTradingViewTabId/);
assert.match(popup, /Choose a TradingView chart/);
assert.match(popup, /serviceVersion/);
assert.match(popup, /serviceVersionText/);
assert.match(popup, /extensionBuildInfo/);
assert.match(popup, /contentDiagnostic/);
assert.match(popup, /copyPayload\.disabled/);
assert.match(popup, /No supported data detected/);
assert.match(popup, /migrateSettings/);
assert.match(popup, /renderOverview/);
assert.match(popup, /All charts/);
assert.match(popup, /Local API offline/);
assert.match(popup, /TradingView ready/);
assert.match(popupHtml, /copy-diagnostics/);
assert.match(popupHtml, /copy-payload/);
assert.match(popupHtml, /Send to TradingView/);
assert.match(popupHtml, /id="send-tradingview"/);
assert.match(popupHtml, /Copy payload instead/);
assert.match(popupHtml, /id="tradingview-tab"/);
assert.match(popupHtml, /role="status"/);
assert.match(popupHtml, /aria-live="polite"/);
assert.match(popupHtml, /for="symbol">Chart/);
assert.match(popupHtml, /Checking supported RocketScooter charts/);
assert.match(popupHtml, /build-info\.js/);
assert.match(popupHtml, /build-id/);
assert.match(popupHtml, /header-summary/);
assert.match(popupHtml, /tools-panel/);
assert.match(popupHtml, /Tools &amp; diagnostics/);
assert.match(popupHtml, /technical-details/);
assert.match(popupHtml, /Refresh status/);
assert.match(popupHtml, /reconnect/);
assert.match(popupHtml, /open-docs/);
assert.match(popupHtml, /open-plugins/);
assert.doesNotMatch(popupHtml, /capture-enabled|capture-disclosure|RocketScooter capture/);
assert.match(popupHtml, /observed-count/);
assert.match(popupHtml, /ignored-count/);
assert.match(popupHtml, /skipped-count/);
assert.match(popupHtml, /service-version/);
assert.match(popupCss, /\.pill\.warning/);
assert.match(popupCss, /\.build-meta/);
assert.doesNotMatch(popupCss, /\.switch|\.capture-consent|\.capture-tooltip/);
assert.match(popupCss, /\.chart-hint/);
assert.match(popupCss, /min-height: 44px/);
assert.match(popupCss, /appearance: none/);
assert.match(popupCss, /background-position: right 14px center/);
assert.match(popupCss, /:focus-visible/);
assert.match(popupCss, /prefers-reduced-motion/);
assert.match(popupCss, /\[hidden\]/);
assert.match(popupCss, /\.action-hint/);
assert.match(popupCss, /button\.tertiary/);
assert.match(popupCss, /\.tools-panel/);
assert.match(readFileSync(join(root, 'src', 'capture-rules.js'), 'utf8'), /isTextLikeContentType/);
assert.match(readFileSync(join(root, 'src', 'build-info.js'), 'utf8'), /RS_LEVELS_BUILD/);
assert.match(readFileSync(join(root, '..', 'local-service', 'src', 'build-info.js'), 'utf8'), /SERVICE_BUILD/);
assert.match(shared, /settingsVersion: 6/);
assert.doesNotMatch(shared, /captureEnabled/);
assert.match(shared, /symbols: \['ES', 'NQ'\]/);
assert.match(shared, /publicDisplaySymbol/);
assert.match(shared, /validPayloadSymbol/);
assert.match(shared, /captureToTradingViewSnapshot/);
assert.match(shared, /tradingViewPayloadFromSnapshot/);
assert.match(shared, /preferredTradingViewTabId/);
assert.match(shared, /liq-map/);
assert.match(shared, /dyn-hp/);
assert.match(shared, /tview\/settings/);
assert.match(shared, /tview\/indicators/);
assert.match(options, /webext\.permissions\.request/);
assert.match(options, /webext\.permissions\.contains/);
assert.match(options, /testService/);
assert.match(options, /fetchHealth/);
assert.match(options, /\/health/);
assert.match(options, /AbortController/);
assert.match(options, /permissionStatus/);
assert.match(options, /migrateSettings/);
assert.match(optionsHtml, /test-service/);
assert.doesNotMatch(optionsHtml, /capture-enabled|capture-disclosure|RocketScooter capture/);
assert.match(optionsHtml, /permission-status/);
assert.match(optionsCss, /\.status\.warning/);
assert.match(optionsCss, /box-sizing: border-box/);
assert.doesNotMatch(optionsCss, /input\[type="checkbox"\]|\.capture-consent|\.switch/);

console.log('browser extension static tests passed');

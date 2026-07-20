importScripts('shared.js');

const TRADINGVIEW_SESSION_KEY = 'rsLevelsTradingViewSession';
const TRADINGVIEW_SESSION_VERSION = 1;
const TRADINGVIEW_PERMISSION_ORIGIN = 'https://*.tradingview.com/*';
const TRADINGVIEW_CHART_MATCHES = [
  'https://tradingview.com/chart/*',
  'https://*.tradingview.com/chart/*'
];
const TRADINGVIEW_MAX_PAYLOAD_LENGTH = 40960;
const TRADINGVIEW_DETECTED_FRESH_MS = 2 * 60 * 1000;
const TRADINGVIEW_HANDOFF_MS = 45 * 1000;

const state = {
  postedCount: 0,
  lastCaptureAt: '',
  lastPostAt: '',
  lastError: '',
  tradingViewSnapshot: null,
  detectedTradingViewSnapshot: null,
  detectedTradingViewCapturedAt: '',
  detectedSymbols: [],
  tradingViewPayloadAt: '',
  tradingViewReceivedAt: '',
  tradingViewRevision: 0,
  tradingViewSourceTabId: 0,
  contentDiagnostic: {
    reason: '',
    detail: '',
    at: ''
  },
  captureStats: emptyCaptureStats()
};

let tradingViewHydration = null;
let tradingViewWrite = Promise.resolve();

if (chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => clearDetectedTradingViewSource(tabId).catch(() => {}));
}

if (chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo && changeInfo.url && !isRocketScooterUrl(changeInfo.url)) {
      return clearDetectedTradingViewSource(tabId).catch(() => {});
    }
    return undefined;
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['settingsVersion', 'serviceUrl', 'captureEnabled', 'endpointPatterns', 'maxCaptureBytes']);
  const settings = globalThis.RS_LEVELS.migrateSettings(stored);
  await chrome.storage.local.set(settings);
  const session = chrome.storage && chrome.storage.session;
  if (session) {
    try {
      await session.remove(TRADINGVIEW_SESSION_KEY);
    } catch (_error) {}
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type === undefined) return false;
  if (message.type === 'rs-levels.capture') {
    postCapture(message.capture, sender).then((result) => sendResponse(result));
    return true;
  }
  if (message.type === 'rs-levels.capture-diagnostic') {
    state.captureStats = cleanCaptureStats(message.stats);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === 'rs-levels.content-diagnostic') {
    state.contentDiagnostic = cleanContentDiagnostic(message.diagnostic);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === 'rs-levels.inject-active-tab') {
    injectActiveTab().then((result) => sendResponse(result));
    return true;
  }
  if (message.type === 'rs-levels.tradingview-payload') {
    tradingViewPayloadResponse(message.scope, { detectedOnly: message.detectedOnly === true })
      .then((result) => sendResponse(result));
    return true;
  }
  if (message.type === 'rs-levels.tradingview-tabs') {
    listTradingViewTabs().then((result) => sendResponse(result));
    return true;
  }
  if (message.type === 'rs-levels.send-to-tradingview') {
    sendToTradingView(message).then((result) => sendResponse(result));
    return true;
  }
  if (message.type === 'rs-levels.state') {
    extensionStateResponse().then((result) => sendResponse(result));
    return true;
  }
  return false;
});

async function postCapture(capture, sender = {}) {
  let settings;
  try {
    const stored = await chrome.storage.local.get(['serviceUrl', 'captureEnabled', 'endpointPatterns', 'maxCaptureBytes']);
    settings = globalThis.RS_LEVELS.cleanSettings(stored);
  } catch (err) {
    state.lastError = err && err.message ? err.message : 'Invalid extension settings';
    return { ok: false, error: state.lastError };
  }

  if (!settings.captureEnabled) return { ok: true, skipped: true };

  state.lastCaptureAt = capture && capture.capturedAt || new Date().toISOString();
  await rememberTradingViewSnapshot(capture, sender && sender.tab && sender.tab.id);

  try {
    const response = await fetch(`${settings.serviceUrl}/capture/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: capture.endpoint || capture.url || '',
        url: capture.url || '',
        method: capture.method || 'GET',
        status: Number(capture.status) || 0,
        capturedAt: capture.capturedAt || state.lastCaptureAt,
        body: capture.body || ''
      })
    });
    if (!response.ok) throw new Error(`Local service returned ${response.status}`);
    state.postedCount += 1;
    state.lastPostAt = new Date().toISOString();
    state.lastError = '';
    return { ok: true };
  } catch (err) {
    state.lastError = err && err.message ? err.message : 'Local service unavailable';
    return { ok: false, error: state.lastError };
  }
}

async function rememberTradingViewSnapshot(capture, sourceTabId = 0) {
  await hydrateTradingViewState();

  const snapshot = globalThis.RS_LEVELS.captureToTradingViewSnapshot(capture);
  const isPageReader = capture && capture.endpoint === '/page-reader/display';
  const capturedAt = captureTimestamp(capture, snapshot);
  let changed = false;

  if (isPageReader && isAtLeastAsNew(capturedAt, state.detectedTradingViewCapturedAt)) {
    state.detectedTradingViewSnapshot = snapshot;
    state.detectedTradingViewCapturedAt = capturedAt;
    state.detectedSymbols = snapshot ? snapshot.symbols.map((row) => row.symbol) : [];
    state.tradingViewReceivedAt = new Date().toISOString();
    state.tradingViewSourceTabId = snapshot ? nonNegativeInteger(sourceTabId) : 0;
    changed = true;
  }

  if (snapshot && isAtLeastAsNew(capturedAt, state.tradingViewPayloadAt)) {
    state.tradingViewSnapshot = snapshot;
    state.tradingViewPayloadAt = snapshot.generatedAt || capturedAt;
    changed = true;
  }

  if (!changed) return;

  state.tradingViewRevision += 1;
  await persistTradingViewState();
}

async function tradingViewPayloadResponse(scope, options = {}) {
  await hydrateTradingViewState();

  if (options.detectedOnly) {
    const availabilityIssue = await detectedTradingViewIssue();
    if (availabilityIssue) {
      return { ok: false, error: availabilityIssue };
    }
  }

  const selectedScope = scope || 'ALL';
  const detectedPayload = globalThis.RS_LEVELS.tradingViewPayloadFromSnapshot(
    state.detectedTradingViewSnapshot,
    selectedScope
  );

  if (options.detectedOnly && !detectedPayload) {
    return {
      ok: false,
      error: 'No current detected-chart TradingView levels are available yet.'
    };
  }

  const snapshot = detectedPayload ? state.detectedTradingViewSnapshot : state.tradingViewSnapshot;
  const payload = detectedPayload || globalThis.RS_LEVELS.tradingViewPayloadFromSnapshot(snapshot, selectedScope);
  if (!payload) {
    return {
      ok: false,
      error: 'No extension-captured TradingView levels are available yet.'
    };
  }

  return {
    ok: true,
    payload,
    generatedAt: snapshot.generatedAt || state.tradingViewPayloadAt,
    receivedAt: state.tradingViewReceivedAt,
    revision: state.tradingViewRevision,
    symbols: snapshot.symbols.map((row) => row.symbol)
  };
}

async function detectedTradingViewIssue() {
  if (!state.detectedTradingViewSnapshot) {
    return 'No current detected-chart TradingView levels are available yet.';
  }

  try {
    const stored = await chrome.storage.local.get(['captureEnabled']);
    if (stored && stored.captureEnabled === false) {
      return 'Capture is paused. Enable capture and refresh RocketScooter before sending to TradingView.';
    }
  } catch (_error) {}

  const receivedAt = new Date(state.tradingViewReceivedAt).getTime();
  const ageMs = Date.now() - receivedAt;
  if (!Number.isFinite(receivedAt) || ageMs < -30000 || ageMs > TRADINGVIEW_DETECTED_FRESH_MS) {
    return 'Detected chart data is stale. Refresh RocketScooter before sending to TradingView.';
  }

  const sourceTabId = nonNegativeInteger(state.tradingViewSourceTabId);
  if (!sourceTabId) {
    return 'The RocketScooter source chart is no longer open. Refresh RocketScooter before sending to TradingView.';
  }

  try {
    const tab = await chrome.tabs.get(sourceTabId);
    if (!tab || !isRocketScooterUrl(tab.url || '')) {
      return 'The RocketScooter source chart is no longer open. Refresh RocketScooter before sending to TradingView.';
    }
  } catch (_error) {
    return 'The RocketScooter source chart is no longer open. Refresh RocketScooter before sending to TradingView.';
  }

  return '';
}

async function clearDetectedTradingViewSource(tabId) {
  await hydrateTradingViewState();
  if (nonNegativeInteger(tabId) !== state.tradingViewSourceTabId) return;
  if (!state.detectedTradingViewSnapshot && !state.detectedSymbols.length) return;

  state.detectedTradingViewSnapshot = null;
  state.detectedTradingViewCapturedAt = '';
  state.detectedSymbols = [];
  state.tradingViewSourceTabId = 0;
  state.tradingViewRevision += 1;
  await persistTradingViewState();
}

async function extensionStateResponse() {
  await hydrateTradingViewState();
  return { ok: true, state };
}

async function hydrateTradingViewState() {
  if (tradingViewHydration) return tradingViewHydration;

  tradingViewHydration = (async () => {
    const session = chrome.storage && chrome.storage.session;
    if (!session) return;

    try {
      const stored = await session.get(TRADINGVIEW_SESSION_KEY);
      const record = cleanStoredTradingViewRecord(stored && stored[TRADINGVIEW_SESSION_KEY]);
      if (!record || state.tradingViewRevision > 0) return;
      state.tradingViewSnapshot = record.tradingViewSnapshot;
      state.detectedTradingViewSnapshot = record.detectedTradingViewSnapshot;
      state.detectedTradingViewCapturedAt = record.detectedTradingViewCapturedAt;
      state.detectedSymbols = record.detectedTradingViewSnapshot
        ? record.detectedTradingViewSnapshot.symbols.map((row) => row.symbol)
        : [];
      state.tradingViewPayloadAt = record.tradingViewPayloadAt;
      state.tradingViewReceivedAt = record.receivedAt;
      state.tradingViewRevision = record.revision;
      state.tradingViewSourceTabId = record.sourceTabId;
    } catch (_error) {}
  })();

  return tradingViewHydration;
}

async function persistTradingViewState() {
  const session = chrome.storage && chrome.storage.session;
  if (!session) return;

  const record = {
    version: TRADINGVIEW_SESSION_VERSION,
    revision: state.tradingViewRevision,
    receivedAt: state.tradingViewReceivedAt,
    sourceTabId: state.tradingViewSourceTabId,
    tradingViewPayloadAt: state.tradingViewPayloadAt,
    detectedTradingViewCapturedAt: state.detectedTradingViewCapturedAt,
    tradingViewSnapshot: state.tradingViewSnapshot,
    detectedTradingViewSnapshot: state.detectedTradingViewSnapshot
  };

  tradingViewWrite = tradingViewWrite
    .catch(() => {})
    .then(() => session.set({ [TRADINGVIEW_SESSION_KEY]: record }));

  try {
    await tradingViewWrite;
  } catch (_error) {}
}

function cleanStoredTradingViewRecord(input) {
  if (!input || Number(input.version) !== TRADINGVIEW_SESSION_VERSION) return null;

  const tradingViewSnapshot = cleanStoredSnapshot(input.tradingViewSnapshot);
  const detectedTradingViewSnapshot = cleanStoredSnapshot(input.detectedTradingViewSnapshot);
  if (!tradingViewSnapshot && !detectedTradingViewSnapshot) return null;

  return {
    revision: Math.max(1, nonNegativeInteger(input.revision)),
    receivedAt: cleanIsoTime(input.receivedAt),
    sourceTabId: nonNegativeInteger(input.sourceTabId),
    tradingViewPayloadAt: cleanIsoTime(input.tradingViewPayloadAt),
    detectedTradingViewCapturedAt: cleanIsoTime(input.detectedTradingViewCapturedAt),
    tradingViewSnapshot: tradingViewSnapshot || detectedTradingViewSnapshot,
    detectedTradingViewSnapshot
  };
}

function cleanStoredSnapshot(input) {
  if (!input || !Array.isArray(input.symbols)) return null;
  try {
    const payload = globalThis.RS_LEVELS.tradingViewPayloadFromSnapshot(input, 'ALL');
    return payload ? input : null;
  } catch (_error) {
    return null;
  }
}

async function listTradingViewTabs() {
  try {
    const [tabs, activeTabs] = await Promise.all([
      chrome.tabs.query({ url: TRADINGVIEW_CHART_MATCHES }),
      chrome.tabs.query({ active: true, currentWindow: true })
    ]);
    const activeId = activeTabs && activeTabs[0] && activeTabs[0].id;
    const matches = (tabs || [])
      .filter((tab) => tab && Number.isInteger(tab.id) && isTradingViewChartUrl(tab.url || ''))
      .map((tab) => ({
        id: tab.id,
        title: cleanTabTitle(tab.title),
        current: tab.id === activeId,
        windowId: tab.windowId
      }));
    return {
      ok: true,
      permissionOrigin: TRADINGVIEW_PERMISSION_ORIGIN,
      tabs: matches
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : 'TradingView tabs are unavailable.'
    };
  }
}

async function sendToTradingView(message) {
  try {
    const payload = globalThis.RS_LEVELS.cleanTradingViewPayload(message.payload);
    if (payload.length > TRADINGVIEW_MAX_PAYLOAD_LENGTH) {
      throw new Error('The TradingView payload is too large for the Pine input.');
    }

    const tabId = nonNegativeInteger(message.tabId);
    if (!tabId) throw new Error('Choose a TradingView chart tab first.');

    const tab = await chrome.tabs.get(tabId);
    if (!tab || !isTradingViewChartUrl(tab.url || '')) {
      throw new Error('The selected tab is no longer a TradingView chart.');
    }

    const requestId = handoffRequestId();
    const generatedAt = String(payload.split('|')[2] || '');
    const scopeLabel = cleanScopeLabel(message.scopeLabel);
    const expiresAt = Date.now() + TRADINGVIEW_HANDOFF_MS;

    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ['src/tradingview-content.js'],
      world: 'ISOLATED'
    });

    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'rs-levels.tradingview-arm-v2',
      requestId,
      payload,
      generatedAt,
      scopeLabel,
      expiresAt
    }, { frameId: 0 });

    if (!response || response.ok !== true) {
      throw new Error(response && response.error || 'TradingView autofill did not start.');
    }

    await chrome.tabs.update(tabId, { active: true });
    if (Number.isInteger(tab.windowId)) {
      try {
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch (_error) {}
    }

    return {
      ok: true,
      state: response.state || 'waiting',
      requestId,
      tabId,
      title: cleanTabTitle(tab.title)
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : 'Could not send levels to TradingView.'
    };
  }
}

function captureTimestamp(capture, snapshot) {
  return cleanIsoTime(
    snapshot && snapshot.generatedAt ||
    capture && capture.capturedAt ||
    new Date().toISOString()
  );
}

function isAtLeastAsNew(candidate, current) {
  const candidateTime = new Date(candidate).getTime();
  const currentTime = new Date(current).getTime();
  if (!Number.isFinite(candidateTime)) return false;
  if (!Number.isFinite(currentTime)) return true;
  return candidateTime >= currentTime;
}

function cleanIsoTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function cleanScopeLabel(value) {
  const text = String(value || 'Selected charts').replace(/[^A-Za-z0-9 .,+/&()-]/g, '').trim();
  return text.slice(0, 80) || 'Selected charts';
}

function cleanTabTitle(value) {
  return String(value || 'TradingView chart').replace(/[\n\t]+/g, ' ').trim().slice(0, 160) || 'TradingView chart';
}

function handoffRequestId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

function isTradingViewChartUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'tradingview.com' || url.hostname.endsWith('.tradingview.com')) &&
      url.pathname.startsWith('/chart/');
  } catch (_error) {
    return false;
  }
}

async function injectActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) throw new Error('No active tab found');
    if (!isRocketScooterUrl(tab.url || '')) {
      throw new Error('Open a RocketScooter tab before reconnecting capture');
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['src/shared.js', 'src/content-script.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['src/capture-rules.js', 'src/page-hook.js', 'src/page-reader.js'],
      world: 'MAIN'
    });
    state.lastError = '';
    return { ok: true };
  } catch (err) {
    state.lastError = err && err.message ? err.message : 'Capture reconnect failed';
    return { ok: false, error: state.lastError };
  }
}

function isRocketScooterUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      url.hostname === 'rocket.place' ||
      url.hostname.endsWith('.rocket.place') ||
      url.hostname === 'rocketscooter.com' ||
      url.hostname.endsWith('.rocketscooter.com')
    );
  } catch (_err) {
    return false;
  }
}

function emptyCaptureStats() {
  return {
    observedCount: 0,
    ignoredCount: 0,
    skippedDisabledCount: 0,
    skippedTooLargeCount: 0,
    skippedNonTextCount: 0,
    skippedEmptyCount: 0,
    readErrorCount: 0,
    publishedCount: 0,
    lastReason: '',
    lastDiagnosticAt: ''
  };
}

function cleanContentDiagnostic(input = {}) {
  return {
    reason: String(input.reason || ''),
    detail: String(input.detail || ''),
    at: String(input.at || '')
  };
}

function cleanCaptureStats(input = {}) {
  return {
    observedCount: nonNegativeInteger(input.observedCount),
    ignoredCount: nonNegativeInteger(input.ignoredCount),
    skippedDisabledCount: nonNegativeInteger(input.skippedDisabledCount),
    skippedTooLargeCount: nonNegativeInteger(input.skippedTooLargeCount),
    skippedNonTextCount: nonNegativeInteger(input.skippedNonTextCount),
    skippedEmptyCount: nonNegativeInteger(input.skippedEmptyCount),
    readErrorCount: nonNegativeInteger(input.readErrorCount),
    publishedCount: nonNegativeInteger(input.publishedCount),
    lastReason: String(input.lastReason || ''),
    lastDiagnosticAt: String(input.lastDiagnosticAt || '')
  };
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.trunc(number));
}

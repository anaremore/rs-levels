importScripts('shared.js');

const state = {
  postedCount: 0,
  lastCaptureAt: '',
  lastPostAt: '',
  lastError: '',
  tradingViewSnapshot: null,
  tradingViewPayloadAt: '',
  contentDiagnostic: {
    reason: '',
    detail: '',
    at: ''
  },
  captureStats: emptyCaptureStats()
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['settingsVersion', 'serviceUrl', 'captureEnabled', 'endpointPatterns', 'maxCaptureBytes']);
  const settings = globalThis.RS_LEVELS.migrateSettings(stored);
  await chrome.storage.local.set(settings);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type === undefined) return false;
  if (message.type === 'rs-levels.capture') {
    postCapture(message.capture).then((result) => sendResponse(result));
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
    sendResponse(tradingViewPayloadResponse(message.scope));
    return false;
  }
  if (message.type === 'rs-levels.state') {
    sendResponse({ ok: true, state });
    return false;
  }
  return false;
});

async function postCapture(capture) {
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
  rememberTradingViewSnapshot(capture);

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

function rememberTradingViewSnapshot(capture) {
  const snapshot = globalThis.RS_LEVELS.captureToTradingViewSnapshot(capture);
  if (!snapshot) return;
  state.tradingViewSnapshot = snapshot;
  state.tradingViewPayloadAt = snapshot.generatedAt || new Date().toISOString();
}

function tradingViewPayloadResponse(scope) {
  const payload = globalThis.RS_LEVELS.tradingViewPayloadFromSnapshot(state.tradingViewSnapshot, scope || 'ALL');
  if (!payload) {
    return {
      ok: false,
      error: 'No extension-captured TradingView levels are available yet.'
    };
  }
  return {
    ok: true,
    payload,
    generatedAt: state.tradingViewPayloadAt,
    symbols: state.tradingViewSnapshot.symbols.map((row) => row.symbol)
  };
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

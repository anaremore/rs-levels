importScripts('shared.js');

const state = {
  postedCount: 0,
  lastCaptureAt: '',
  lastPostAt: '',
  lastError: '',
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

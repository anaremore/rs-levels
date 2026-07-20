const els = {
  serviceUrl: document.getElementById('service-url'),
  statusPill: document.getElementById('status-pill'),
  buildId: document.getElementById('build-id'),
  symbol: document.getElementById('symbol'),
  captureEnabled: document.getElementById('capture-enabled'),
  sendTradingView: document.getElementById('send-tradingview'),
  copyPayload: document.getElementById('copy-payload'),
  tradingViewTargetRow: document.getElementById('tradingview-target-row'),
  tradingViewTab: document.getElementById('tradingview-tab'),
  tradingViewAccess: document.getElementById('tradingview-access'),
  reconnect: document.getElementById('reconnect'),
  copyDiagnostics: document.getElementById('copy-diagnostics'),
  openDocs: document.getElementById('open-docs'),
  openPlugins: document.getElementById('open-plugins'),
  message: document.getElementById('message'),
  sourceState: document.getElementById('source-state'),
  levelCount: document.getElementById('level-count'),
  serviceVersion: document.getElementById('service-version'),
  postedCount: document.getElementById('posted-count'),
  lastCapture: document.getElementById('last-capture'),
  lastPost: document.getElementById('last-post'),
  lastError: document.getElementById('last-error'),
  observedCount: document.getElementById('observed-count'),
  ignoredCount: document.getElementById('ignored-count'),
  skippedCount: document.getElementById('skipped-count'),
  hookReason: document.getElementById('hook-reason'),
  refresh: document.getElementById('refresh'),
  options: document.getElementById('options')
};

const ALL_SCOPE = 'ALL';
const TRADINGVIEW_PERMISSION_ORIGIN = 'https://*.tradingview.com/*';

let settings = globalThis.RS_LEVELS.cleanSettings({});
let symbols = [];
let latestServiceStatus = null;
let tradingViewTabs = [];
let tradingViewPermission = false;
let tradingViewOpenMode = false;
let sending = false;

init();

async function init() {
  const stored = await chrome.storage.local.get(['settingsVersion', 'serviceUrl', 'captureEnabled', 'endpointPatterns', 'maxCaptureBytes']);
  settings = globalThis.RS_LEVELS.migrateSettings(stored);
  if (settings.settingsVersion !== stored.settingsVersion) {
    await chrome.storage.local.set(settings);
  }
  els.serviceUrl.textContent = settings.serviceUrl;
  els.captureEnabled.checked = settings.captureEnabled;
  renderBuildIdentity();
  renderSymbols(symbols);
  bindEvents();
  await Promise.all([refresh(), refreshTradingViewAccess()]);
}

function bindEvents() {
  els.refresh.addEventListener('click', refresh);
  els.options.addEventListener('click', () => chrome.runtime.openOptionsPage());
  els.sendTradingView.addEventListener('click', sendTradingViewPayload);
  els.copyPayload.addEventListener('click', copyTradingViewPayload);
  els.reconnect.addEventListener('click', reconnectActiveTab);
  els.copyDiagnostics.addEventListener('click', copyDiagnostics);
  els.openDocs.addEventListener('click', () => window.open(`${settings.serviceUrl}/docs`, '_blank', 'noopener'));
  els.openPlugins.addEventListener('click', () => window.open(`${settings.serviceUrl}/plugins`, '_blank', 'noopener'));
  els.symbol.addEventListener('change', renderTransferState);
  els.tradingViewTab.addEventListener('change', renderTransferState);
  els.captureEnabled.addEventListener('change', toggleCapture);
}

async function refresh() {
  setMessage('Checking open RocketScooter charts');
  let extState = {};
  try {
    const extensionState = await chrome.runtime.sendMessage({ type: 'rs-levels.state' });
    extState = extensionState && extensionState.state ? extensionState.state : {};
  } catch (_err) {}
  symbols = exportScopes(extState.detectedSymbols);
  renderSymbols(symbols);
  renderTransferState();
  els.postedCount.textContent = String(extState.postedCount || 0);
  els.lastCapture.textContent = formatTime(extState.lastCaptureAt);
  els.lastPost.textContent = formatTime(extState.lastPostAt);
  els.lastError.textContent = extState.lastError || 'none';
  renderCaptureStats(extState.captureStats);

  try {
    const health = await getJson('/health');
    const status = await getJson('/status');
    latestServiceStatus = combineServiceStatus(health, status);
    const source = health.source || {};
    const sourceState = source.state || 'waiting';
    els.sourceState.textContent = sourceState;
    els.levelCount.textContent = String(health.levelCount || 0);
    els.serviceVersion.textContent = serviceVersionText(health);
    renderTransferState();
    renderPill(source);
    if (symbols.length) {
      setMessage(detectedMessage(), 'ok');
    } else if (extState.lastError && !globalThis.RS_LEVELS.hasAnyDisplayData(latestServiceStatus)) {
      setMessage(extState.lastError, 'error');
    } else if (sourceState === 'stale') {
      setMessage('No supported data detected in the open charts. Captured service data is stale.', 'warning');
    } else {
      setMessage('No supported data detected in the open RocketScooter charts.');
    }
  } catch (err) {
    latestServiceStatus = null;
    els.sourceState.textContent = 'offline';
    els.levelCount.textContent = '0';
    els.serviceVersion.textContent = 'unknown';
    setPill(symbols.length ? 'CAPTURED' : 'OFFLINE', symbols.length ? 'warning' : 'error');
    renderTransferState();
    setMessage(
      symbols.length ? `${detectedMessage()} Local service is offline.` : (err && err.message ? err.message : 'Local service unavailable'),
      symbols.length ? 'warning' : 'error'
    );
  }
}

async function refreshTradingViewAccess() {
  try {
    tradingViewPermission = await chrome.permissions.contains({
      origins: [TRADINGVIEW_PERMISSION_ORIGIN]
    });
    if (tradingViewPermission) await loadTradingViewTabs();
  } catch (_error) {
    tradingViewPermission = false;
    tradingViewTabs = [];
  }
  renderTradingViewTargets();
  renderTradingViewAccess();
  renderTransferState();
}

async function sendTradingViewPayload() {
  if (sending) return;

  if (tradingViewOpenMode) {
    setSending(true, 'Opening…');
    try {
      await chrome.tabs.create({ url: 'https://www.tradingview.com/chart/' });
      tradingViewOpenMode = false;
      tradingViewTabs = [];
      renderTradingViewTargets();
      renderTradingViewAccess();
      setMessage('TradingView opened. Open indicator settings, then send again.', 'ok');
    } catch (err) {
      setMessage(err && err.message ? err.message : 'Could not open TradingView.', 'error');
    } finally {
      setSending(false);
    }
    return;
  }

  const scope = selectedSymbol();
  if (!scope) {
    setMessage('Open a RocketScooter chart with HP, MHP, or liquidity-map data first.', 'warning');
    return;
  }

  setSending(true);

  try {
    // This request must be the first awaited operation after the click.
    tradingViewPermission = await chrome.permissions.request({
      origins: [TRADINGVIEW_PERMISSION_ORIGIN]
    });
    if (!tradingViewPermission) {
      tradingViewTabs = [];
      renderTradingViewTargets();
      renderTradingViewAccess();
      setMessage('TradingView access was not enabled. You can keep using Copy payload instead.', 'warning');
      return;
    }

    await loadTradingViewTabs();
    renderTradingViewTargets();
    renderTradingViewAccess();

    if (!tradingViewTabs.length) {
      tradingViewOpenMode = true;
      setMessage('No open TradingView chart found. Open one, add RS Levels, then send again.', 'warning');
      return;
    }

    if (tradingViewTabs.length > 1 && !selectedTradingViewTabId()) {
      setMessage('Choose the TradingView chart to fill, then click Send to TradingView again.', 'warning');
      return;
    }

    const tabId = selectedTradingViewTabId();
    if (!tabId) throw new Error('Choose a TradingView chart tab first.');

    const resolved = await resolveTradingViewPayload(scope, { detectedOnly: true });
    if (!resolved.ok) {
      setMessage(resolved.error, resolved.mode || 'warning');
      return;
    }

    const result = await chrome.runtime.sendMessage({
      type: 'rs-levels.send-to-tradingview',
      tabId,
      payload: resolved.payload,
      scopeLabel: scopeLabel(scope)
    });
    if (!result || result.ok !== true) {
      throw new Error(result && result.error || 'TradingView autofill did not start.');
    }

    if (result.state === 'filled') {
      setMessage('RS Levels payload filled. Review the value, then click OK.', 'ok');
    } else {
      setMessage('Waiting up to 45 seconds for the RS Levels Payload field.', 'warning');
    }
  } catch (err) {
    setMessage(err && err.message ? err.message : 'Could not send levels to TradingView.', 'error');
  } finally {
    setSending(false);
    renderTradingViewAccess();
  }
}

async function loadTradingViewTabs() {
  const result = await chrome.runtime.sendMessage({ type: 'rs-levels.tradingview-tabs' });
  if (!result || result.ok !== true) {
    throw new Error(result && result.error || 'TradingView tabs are unavailable.');
  }
  tradingViewTabs = (Array.isArray(result.tabs) ? result.tabs : []).filter((tab) =>
    tab && Number.isInteger(tab.id)
  );
  if (tradingViewTabs.length) tradingViewOpenMode = false;
  return tradingViewTabs;
}

function renderTradingViewTargets() {
  const selectedId = Number(els.tradingViewTab.value);
  const preferredId = globalThis.RS_LEVELS.preferredTradingViewTabId(tradingViewTabs, selectedId);
  const options = [];

  if (tradingViewTabs.length > 1) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a TradingView chart';
    placeholder.disabled = true;
    options.push(placeholder);
  }

  tradingViewTabs.forEach((tab) => {
    const option = document.createElement('option');
    option.value = String(tab.id);
    option.textContent = `${tab.current ? 'Current · ' : ''}${tab.title || 'TradingView chart'}`;
    options.push(option);
  });
  els.tradingViewTab.replaceChildren(...options);
  els.tradingViewTab.value = preferredId ? String(preferredId) : '';

  els.tradingViewTargetRow.hidden = tradingViewTabs.length <= 1;
  els.tradingViewTab.disabled = sending || tradingViewTabs.length <= 1;
}

function renderTradingViewAccess() {
  if (!tradingViewPermission) {
    els.tradingViewAccess.textContent = 'TradingView access: ask on first send';
    return;
  }
  const count = tradingViewTabs.length;
  els.tradingViewAccess.textContent = count
    ? `TradingView access: enabled · ${count} chart${count === 1 ? '' : 's'}`
    : 'TradingView access: enabled · no open chart';
}

function selectedTradingViewTabId() {
  const tabId = Number(els.tradingViewTab.value);
  return Number.isInteger(tabId) && tabId > 0 ? tabId : 0;
}

function setSending(value, label = 'Sending…') {
  sending = value === true;
  els.sendTradingView.setAttribute('aria-busy', String(sending));
  if (sending) els.sendTradingView.textContent = label;
  renderTransferState();
}

async function copyTradingViewPayload() {
  const scope = selectedSymbol();
  if (!scope) {
    setMessage('Open a RocketScooter chart with HP, MHP, or liquidity-map data first.', 'warning');
    return;
  }

  const resolved = await resolveTradingViewPayload(scope);
  if (!resolved.ok) {
    setMessage(resolved.error, resolved.mode || 'warning');
    return;
  }

  try {
    await navigator.clipboard.writeText(resolved.payload);
    setMessage(`${scopeLabel(scope)} TradingView data copied`, 'ok');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'TradingView copy failed', 'error');
  }
}

async function resolveTradingViewPayload(scope, options = {}) {
  const captured = await extensionTradingViewPayloadResult(scope, options);
  if (captured.ok) return captured;

  const publicSymbol = globalThis.RS_LEVELS.publicDisplaySymbol(scope);
  if (scope === ALL_SCOPE || !['ES', 'NQ'].includes(publicSymbol)) {
    return {
      ok: false,
      error: captured.error || `No current chart data is available for ${scopeLabel(scope)}.`,
      mode: 'warning'
    };
  }

  try {
    latestServiceStatus = await getJson('/status');
    renderTransferState();
    const issue = globalThis.RS_LEVELS.tradingViewCopyIssue(latestServiceStatus, scope);
    if (issue) return { ok: false, error: issue, mode: 'warning' };
    return {
      ok: true,
      payload: await fetchTradingViewText(`/tradingview/${encodeURIComponent(scope)}`),
      source: 'local-service'
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : 'TradingView payload unavailable.',
      mode: 'error'
    };
  }
}

async function extensionTradingViewPayloadResult(scope, options = {}) {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'rs-levels.tradingview-payload',
      scope,
      detectedOnly: options.detectedOnly === true
    });
    if (!result || result.ok !== true || !result.payload) {
      return {
        ok: false,
        error: result && result.error || 'No extension-captured TradingView levels are available yet.'
      };
    }
    return {
      ...result,
      ok: true,
      payload: globalThis.RS_LEVELS.cleanTradingViewPayload(result.payload)
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : 'Extension-captured TradingView levels are unavailable.'
    };
  }
}

async function reconnectActiveTab() {
  setMessage('Reconnecting capture hook');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'rs-levels.inject-active-tab' });
    if (!result || result.ok !== true) throw new Error(result && result.error || 'Capture reconnect failed');
    await refresh();
    setMessage('Capture hook reconnected. Refresh RocketScooter data if levels are still waiting.', 'ok');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'Capture reconnect failed', 'error');
  }
}


async function fetchTradingViewText(path, options = {}) {
  const url = `${settings.serviceUrl}${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(copyFailureMessage(response.status, await responseErrorDetail(response), options));
  }
  return globalThis.RS_LEVELS.cleanTradingViewPayload(await response.text());
}

function copyFailureMessage(status, detail = '', options = {}) {
  if (options.allSymbols) {
    if (/no symbols|no futures|symbol not found|no captured/i.test(detail)) {
      return 'No captured ES or NQ levels are available yet.';
    }
    return `All-symbol TradingView payload unavailable (${status})${detail ? `: ${detail}` : ''}`;
  }
  if (status === 404) return `No data for ${scopeLabel(selectedSymbol())}`;
  return `TradingView payload unavailable (${status})${detail ? `: ${detail}` : ''}`;
}

async function responseErrorDetail(response) {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      return String(payload.error || payload.message || '').trim();
    }
    return (await response.text()).trim();
  } catch (_err) {
    return '';
  }
}

async function copyDiagnostics() {
  try {
    const diagnostics = await getJson('/diagnostics');
    const extensionState = await chrome.runtime.sendMessage({ type: 'rs-levels.state' });
    const payload = {
      generatedAt: new Date().toISOString(),
      serviceUrl: settings.serviceUrl,
      build: extensionBuildInfo(),
      service: diagnostics,
      extension: cleanExtensionState(extensionState && extensionState.state)
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setMessage('Diagnostics copied', 'ok');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'Diagnostics copy failed', 'error');
  }
}

async function toggleCapture() {
  try {
    settings = {
      ...settings,
      captureEnabled: els.captureEnabled.checked
    };
    await chrome.storage.local.set({ captureEnabled: settings.captureEnabled });
    setMessage(settings.captureEnabled ? 'Capture enabled.' : 'Capture paused.', settings.captureEnabled ? 'ok' : 'warning');
  } catch (err) {
    els.captureEnabled.checked = settings.captureEnabled;
    setMessage(err && err.message ? err.message : 'Capture setting failed', 'error');
  }
}

async function getJson(path) {
  const response = await fetch(`${settings.serviceUrl}${path}`);
  if (!response.ok) throw new Error(`Local service returned ${response.status}`);
  return response.json();
}

function renderSymbols(nextSymbols) {
  const selected = selectedSymbol();
  if (!nextSymbols.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No chart data detected';
    option.disabled = true;
    option.selected = true;
    els.symbol.replaceChildren(option);
    els.symbol.disabled = true;
    return;
  }
  els.symbol.disabled = false;
  els.symbol.replaceChildren(...nextSymbols.map((symbol) => {
    const option = document.createElement('option');
    option.value = symbol;
    option.textContent = scopeLabel(symbol);
    return option;
  }));
  if (nextSymbols.includes(selected)) els.symbol.value = selected;
  else els.symbol.value = nextSymbols[0];
}

function selectedSymbol() {
  return els.symbol.value || symbols[0] || '';
}

function exportScopes(detectedSymbols = []) {
  const detected = Array.from(new Set((Array.isArray(detectedSymbols) ? detectedSymbols : [])
    .map((symbol) => globalThis.RS_LEVELS.publicDisplaySymbol(symbol))
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  return detected.length > 1 ? [ALL_SCOPE, ...detected] : detected;
}

function scopeLabel(scope) {
  if (scope === ALL_SCOPE) return 'All detected charts';
  return globalThis.RS_LEVELS.publicDisplaySymbol(scope);
}

function detectedMessage() {
  const count = symbols.filter((symbol) => symbol !== ALL_SCOPE).length;
  return `${count} open chart${count === 1 ? '' : 's'} with supported data detected.`;
}

function combineServiceStatus(health = {}, status = {}) {
  return {
    ...health,
    ...status,
    source: status.source || health.source || {},
    levelCount: status.levelCount == null ? health.levelCount : status.levelCount,
    symbolCount: status.symbolCount == null ? health.symbolCount : status.symbolCount
  };
}

function cleanExtensionState(state = {}) {
  return {
    version: extensionVersion(),
    build: extensionBuildInfo(),
    postedCount: Number(state.postedCount) || 0,
    lastCaptureAt: String(state.lastCaptureAt || ''),
    lastPostAt: String(state.lastPostAt || ''),
    lastError: String(state.lastError || ''),
    contentDiagnostic: cleanContentDiagnostic(state.contentDiagnostic),
    detectedSymbols: Array.isArray(state.detectedSymbols) ? state.detectedSymbols.map(String) : [],
    captureStats: cleanCaptureStats(state.captureStats)
  };
}

function cleanContentDiagnostic(input = {}) {
  return {
    reason: String(input.reason || ''),
    detail: String(input.detail || ''),
    at: String(input.at || '')
  };
}

function cleanCaptureStats(stats = {}) {
  return {
    observedCount: nonNegativeInteger(stats.observedCount),
    ignoredCount: nonNegativeInteger(stats.ignoredCount),
    skippedDisabledCount: nonNegativeInteger(stats.skippedDisabledCount),
    skippedTooLargeCount: nonNegativeInteger(stats.skippedTooLargeCount),
    skippedNonTextCount: nonNegativeInteger(stats.skippedNonTextCount),
    skippedEmptyCount: nonNegativeInteger(stats.skippedEmptyCount),
    readErrorCount: nonNegativeInteger(stats.readErrorCount),
    publishedCount: nonNegativeInteger(stats.publishedCount),
    lastReason: String(stats.lastReason || ''),
    lastDiagnosticAt: String(stats.lastDiagnosticAt || '')
  };
}

function renderCaptureStats(stats = {}) {
  const clean = cleanCaptureStats(stats);
  els.observedCount.textContent = String(clean.observedCount);
  els.ignoredCount.textContent = String(clean.ignoredCount);
  els.skippedCount.textContent = String(clean.skippedDisabledCount + clean.skippedTooLargeCount + clean.skippedNonTextCount + clean.skippedEmptyCount + clean.readErrorCount);
  els.hookReason.textContent = clean.lastReason || 'none';
}

function renderTransferState() {
  const selected = selectedSymbol();
  const canOpenTradingView = tradingViewOpenMode && tradingViewPermission;
  if (!sending) {
    els.sendTradingView.textContent = tradingViewOpenMode ? 'Open TradingView' : 'Send to TradingView';
  }
  els.sendTradingView.disabled = sending || (!selected && !canOpenTradingView);
  els.sendTradingView.title = tradingViewOpenMode
    ? 'Open a new TradingView chart'
    : selected
      ? `Fill ${scopeLabel(selected)} in an open RS Levels settings dialog`
      : 'Open a RocketScooter chart with supported data first';

  els.copyPayload.disabled = sending || !selected;
  els.copyPayload.title = selected
    ? `Copy ${scopeLabel(selected)} TradingView payload`
    : 'Open a RocketScooter chart with supported data first';
  els.tradingViewTab.disabled = sending || tradingViewTabs.length <= 1;
}

function formatTime(value) {
  if (!value) return 'none';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.trunc(number));
}

function renderPill(source = {}) {
  if (source.connected) {
    setPill('LIVE', 'live');
    return;
  }
  if (source.state === 'stale') {
    setPill('STALE', 'warning');
    return;
  }
  setPill('WAITING', 'waiting');
}

function setPill(text, mode) {
  els.statusPill.textContent = text;
  els.statusPill.className = `pill ${mode}`;
}

function setMessage(text, mode = '') {
  els.message.textContent = text;
  els.message.className = `message ${mode}`.trim();
}

function renderBuildIdentity() {
  const info = extensionBuildInfo();
  const suffix = info.revision ? `+${info.revision}` : '';
  const text = `ext ${info.version}${suffix}`;
  els.buildId.textContent = text;
  els.buildId.title = [
    `Extension ${info.version}`,
    info.revision ? `Revision ${info.revision}` : 'Source build',
    info.generatedAt ? `Built ${info.generatedAt}` : ''
  ].filter(Boolean).join('\n');
}

function serviceVersionText(health = {}) {
  const build = health.build || {};
  const revision = String(build.revision || '');
  const suffix = revision ? `+${revision}` : '';
  const source = revision ? '' : ` ${String(build.source || 'source')}`;
  return `${String(health.version || 'unknown')}${suffix}${source}`;
}

function extensionBuildInfo() {
  const build = globalThis.RS_LEVELS_BUILD || {};
  return {
    version: extensionVersion(),
    revision: String(build.revision || ''),
    generatedAt: String(build.generatedAt || ''),
    source: String(build.source || 'source')
  };
}

function extensionVersion() {
  try {
    return chrome.runtime.getManifest().version || 'unknown';
  } catch (_err) {
    return 'unknown';
  }
}

const els = {
  serviceUrl: document.getElementById('service-url'),
  statusPill: document.getElementById('status-pill'),
  buildId: document.getElementById('build-id'),
  symbol: document.getElementById('symbol'),
  captureEnabled: document.getElementById('capture-enabled'),
  copyTv: document.getElementById('copy-tv'),
  copyJson: document.getElementById('copy-json'),
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

let settings = globalThis.RS_LEVELS.cleanSettings({});
let symbols = globalThis.RS_LEVELS.defaults.symbols.slice();
let latestServiceStatus = null;

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
  await refresh();
}

function bindEvents() {
  els.refresh.addEventListener('click', refresh);
  els.options.addEventListener('click', () => chrome.runtime.openOptionsPage());
  els.copyTv.addEventListener('click', copyTradingView);
  els.copyJson.addEventListener('click', copyJsonExport);
  els.reconnect.addEventListener('click', reconnectActiveTab);
  els.copyDiagnostics.addEventListener('click', copyDiagnostics);
  els.openDocs.addEventListener('click', () => window.open(`${settings.serviceUrl}/docs`, '_blank', 'noopener'));
  els.openPlugins.addEventListener('click', () => window.open(`${settings.serviceUrl}/plugins`, '_blank', 'noopener'));
  els.symbol.addEventListener('change', () => renderTradingViewCopy(latestServiceStatus));
  els.captureEnabled.addEventListener('change', toggleCapture);
}

async function refresh() {
  setMessage('Checking local service');
  try {
    const health = await getJson('/health');
    const status = await getJson('/status');
    latestServiceStatus = combineServiceStatus(health, status);
    const extensionState = await chrome.runtime.sendMessage({ type: 'rs-levels.state' });
    const extState = extensionState && extensionState.state ? extensionState.state : {};
    symbols = status.symbols && status.symbols.length ? status.symbols : globalThis.RS_LEVELS.defaults.symbols.slice();
    renderSymbols(symbols);
    const source = health.source || {};
    const sourceState = source.state || 'waiting';
    els.sourceState.textContent = sourceState;
    els.levelCount.textContent = String(health.levelCount || 0);
    els.serviceVersion.textContent = String(health.version || 'unknown');
    els.postedCount.textContent = String(extState.postedCount || 0);
    els.lastCapture.textContent = formatTime(extState.lastCaptureAt);
    els.lastPost.textContent = formatTime(extState.lastPostAt);
    els.lastError.textContent = extState.lastError || 'none';
    renderCaptureStats(extState.captureStats);
    renderTradingViewCopy(latestServiceStatus);
    renderPill(source);
    if (extState.lastError && !health.levelCount) {
      setMessage(extState.lastError, 'error');
    } else if (sourceState === 'stale') {
      setMessage('Captured levels are stale.', 'warning');
    } else {
      setMessage(health.levelCount ? 'Levels are available.' : 'Waiting for captured levels.', health.levelCount ? 'ok' : '');
    }
  } catch (err) {
    latestServiceStatus = null;
    renderTradingViewCopy({ levelCount: 0, source: { connected: false } });
    els.serviceVersion.textContent = 'unknown';
    setPill('OFFLINE', 'error');
    setMessage(err && err.message ? err.message : 'Local service unavailable', 'error');
  }
}

async function copyTradingView() {
  try {
    latestServiceStatus = await getJson('/status');
    renderTradingViewCopy(latestServiceStatus);
    const issue = globalThis.RS_LEVELS.tradingViewBundleCopyIssue(latestServiceStatus);
    if (issue) {
      setMessage(issue, 'warning');
      return;
    }
    await copyFromEndpoint('/tradingview', 'TradingView payload copied');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'TradingView copy failed', 'error');
  }
}

async function copyJsonExport() {
  try {
    latestServiceStatus = await getJson('/status');
    renderTradingViewCopy(latestServiceStatus);
    const issue = globalThis.RS_LEVELS.selectedSymbolIssue(latestServiceStatus, selectedSymbol());
    if (issue) {
      setMessage(issue, 'warning');
      return;
    }
    await copyFromEndpoint(`/tradingview/${selectedSymbol()}?format=json`, 'JSON copied', true);
  } catch (err) {
    setMessage(err && err.message ? err.message : 'JSON copy failed', 'error');
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

async function copyFromEndpoint(path, success, prettyJson = false) {
  try {
    const url = `${settings.serviceUrl}${path}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`No data for ${selectedSymbol()}`);
    const text = prettyJson ? JSON.stringify(await response.json(), null, 2) : await response.text();
    await navigator.clipboard.writeText(text);
    setMessage(success, 'ok');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'Copy failed', 'error');
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
  els.symbol.replaceChildren(...nextSymbols.map((symbol) => {
    const option = document.createElement('option');
    option.value = symbol;
    option.textContent = symbol;
    return option;
  }));
  if (nextSymbols.includes(selected)) els.symbol.value = selected;
}

function selectedSymbol() {
  return els.symbol.value || symbols[0] || 'MES';
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

function renderTradingViewCopy(serviceStatus = latestServiceStatus || {}) {
  const selected = selectedSymbol();
  const issue = globalThis.RS_LEVELS.tradingViewBundleCopyIssue(serviceStatus);
  const jsonIssue = globalThis.RS_LEVELS.selectedSymbolIssue(serviceStatus, selected);
  els.copyTv.disabled = Boolean(issue);
  els.copyTv.title = issue || 'Copy all-symbol TradingView payload';
  els.copyJson.disabled = Boolean(jsonIssue);
  els.copyJson.title = jsonIssue || 'Copy JSON export';
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

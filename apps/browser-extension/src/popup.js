const els = {
  serviceUrl: document.getElementById('service-url'),
  statusPill: document.getElementById('status-pill'),
  symbol: document.getElementById('symbol'),
  copyTv: document.getElementById('copy-tv'),
  copyJson: document.getElementById('copy-json'),
  copyDiagnostics: document.getElementById('copy-diagnostics'),
  openDocs: document.getElementById('open-docs'),
  message: document.getElementById('message'),
  sourceState: document.getElementById('source-state'),
  levelCount: document.getElementById('level-count'),
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
let latestHealth = null;

init();

async function init() {
  settings = globalThis.RS_LEVELS.cleanSettings(await chrome.storage.local.get(['serviceUrl', 'captureEnabled', 'endpointPatterns', 'maxCaptureBytes']));
  els.serviceUrl.textContent = settings.serviceUrl;
  renderSymbols(symbols);
  bindEvents();
  await refresh();
}

function bindEvents() {
  els.refresh.addEventListener('click', refresh);
  els.options.addEventListener('click', () => chrome.runtime.openOptionsPage());
  els.copyTv.addEventListener('click', copyTradingView);
  els.copyJson.addEventListener('click', () => copyFromEndpoint(`/tradingview/${selectedSymbol()}?format=json`, 'JSON copied', true));
  els.copyDiagnostics.addEventListener('click', copyDiagnostics);
  els.openDocs.addEventListener('click', () => window.open(`${settings.serviceUrl}/docs`, '_blank', 'noopener'));
}

async function refresh() {
  setMessage('Checking local service');
  try {
    const health = await getJson('/health');
    latestHealth = health;
    const status = await getJson('/status');
    const extensionState = await chrome.runtime.sendMessage({ type: 'rs-levels.state' });
    const extState = extensionState && extensionState.state ? extensionState.state : {};
    symbols = status.symbols && status.symbols.length ? status.symbols : globalThis.RS_LEVELS.defaults.symbols.slice();
    renderSymbols(symbols);
    const source = health.source || {};
    const sourceState = source.state || 'waiting';
    els.sourceState.textContent = sourceState;
    els.levelCount.textContent = String(health.levelCount || 0);
    els.postedCount.textContent = String(extState.postedCount || 0);
    els.lastCapture.textContent = formatTime(extState.lastCaptureAt);
    els.lastPost.textContent = formatTime(extState.lastPostAt);
    els.lastError.textContent = extState.lastError || 'none';
    renderCaptureStats(extState.captureStats);
    renderTradingViewCopy(health);
    renderPill(source);
    if (extState.lastError && !health.levelCount) {
      setMessage(extState.lastError, 'error');
    } else if (sourceState === 'stale') {
      setMessage('Captured levels are stale.', 'warning');
    } else {
      setMessage(health.levelCount ? 'Levels are available.' : 'Waiting for captured levels.', health.levelCount ? 'ok' : '');
    }
  } catch (err) {
    latestHealth = null;
    renderTradingViewCopy({ levelCount: 0, source: { connected: false } });
    setPill('OFFLINE', 'error');
    setMessage(err && err.message ? err.message : 'Local service unavailable', 'error');
  }
}

async function copyTradingView() {
  try {
    const health = await getJson('/health');
    latestHealth = health;
    renderTradingViewCopy(health);
    const issue = globalThis.RS_LEVELS.tradingViewCopyIssue(health);
    if (issue) {
      setMessage(issue, 'warning');
      return;
    }
    await copyFromEndpoint(`/tradingview/${selectedSymbol()}`, 'TradingView payload copied');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'TradingView copy failed', 'error');
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
      service: diagnostics,
      extension: cleanExtensionState(extensionState && extensionState.state)
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setMessage('Diagnostics copied', 'ok');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'Diagnostics copy failed', 'error');
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

function cleanExtensionState(state = {}) {
  return {
    postedCount: Number(state.postedCount) || 0,
    lastCaptureAt: String(state.lastCaptureAt || ''),
    lastPostAt: String(state.lastPostAt || ''),
    lastError: String(state.lastError || ''),
    captureStats: cleanCaptureStats(state.captureStats)
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

function renderTradingViewCopy(health = latestHealth || {}) {
  const issue = globalThis.RS_LEVELS.tradingViewCopyIssue(health);
  els.copyTv.disabled = Boolean(issue);
  els.copyTv.title = issue || 'Copy TradingView payload';
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

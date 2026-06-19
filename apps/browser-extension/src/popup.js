const els = {
  serviceUrl: document.getElementById('service-url'),
  statusPill: document.getElementById('status-pill'),
  symbol: document.getElementById('symbol'),
  copyTv: document.getElementById('copy-tv'),
  copyJson: document.getElementById('copy-json'),
  message: document.getElementById('message'),
  sourceState: document.getElementById('source-state'),
  levelCount: document.getElementById('level-count'),
  postedCount: document.getElementById('posted-count'),
  refresh: document.getElementById('refresh'),
  options: document.getElementById('options')
};

let settings = globalThis.RS_LEVELS.cleanSettings({});
let symbols = globalThis.RS_LEVELS.defaults.symbols.slice();

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
  els.copyTv.addEventListener('click', () => copyFromEndpoint(`/tradingview/${selectedSymbol()}`, 'TradingView payload copied'));
  els.copyJson.addEventListener('click', () => copyFromEndpoint(`/tradingview/${selectedSymbol()}?format=json`, 'JSON copied', true));
}

async function refresh() {
  setMessage('Checking local service');
  try {
    const health = await getJson('/health');
    const status = await getJson('/status');
    const extensionState = await chrome.runtime.sendMessage({ type: 'rs-levels.state' });
    symbols = status.symbols && status.symbols.length ? status.symbols : globalThis.RS_LEVELS.defaults.symbols.slice();
    renderSymbols(symbols);
    els.sourceState.textContent = health.source && health.source.state || 'waiting';
    els.levelCount.textContent = String(health.levelCount || 0);
    els.postedCount.textContent = String(extensionState && extensionState.state ? extensionState.state.postedCount : 0);
    setPill(health.source && health.source.connected ? 'LIVE' : 'WAITING', health.source && health.source.connected ? 'live' : 'waiting');
    setMessage(health.levelCount ? 'Levels are available.' : 'Waiting for captured levels.', health.levelCount ? 'ok' : '');
  } catch (err) {
    setPill('OFFLINE', 'error');
    setMessage(err && err.message ? err.message : 'Local service unavailable', 'error');
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

function setPill(text, mode) {
  els.statusPill.textContent = text;
  els.statusPill.className = `pill ${mode}`;
}

function setMessage(text, mode = '') {
  els.message.textContent = text;
  els.message.className = `message ${mode}`.trim();
}
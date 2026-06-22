const els = {
  serviceUrl: document.getElementById('service-url'),
  symbol: document.getElementById('symbol'),
  refresh: document.getElementById('refresh'),
  connect: document.getElementById('connect'),
  copyPayload: document.getElementById('copy-payload'),
  openApi: document.getElementById('open-api'),
  connection: document.getElementById('connection'),
  freshness: document.getElementById('freshness'),
  sourceState: document.getElementById('source-state'),
  symbolCount: document.getElementById('symbol-count'),
  levelCount: document.getElementById('level-count'),
  capturedAt: document.getElementById('captured-at'),
  statDd: document.getElementById('stat-dd'),
  statRi: document.getElementById('stat-ri'),
  statRes: document.getElementById('stat-res'),
  statMres: document.getElementById('stat-mres'),
  statWres: document.getElementById('stat-wres'),
  statMap: document.getElementById('stat-map'),
  levelsBody: document.getElementById('levels-body'),
  message: document.getElementById('message')
};

let snapshot = null;
let stream = null;

els.refresh.addEventListener('click', refresh);
els.connect.addEventListener('click', toggleStream);
els.symbol.addEventListener('change', render);
els.copyPayload.addEventListener('click', () => copyTradingViewPayload(`/tradingview/${selectedSymbol()}`));
els.openApi.addEventListener('click', () => window.open(`${baseUrl()}/`, '_blank', 'noopener'));

refresh();

async function refresh() {
  try {
    setMessage('Refreshing');
    const response = await fetch(`${baseUrl()}/snapshot`);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    snapshot = await response.json();
    renderSymbols();
    render();
    setConnection(snapshot.source?.connected ? 'LIVE' : 'WAITING', snapshot.source?.connected ? 'live' : 'muted');
    setMessage('Snapshot loaded', 'ok');
  } catch (err) {
    setConnection('OFFLINE', 'error');
    setMessage(err.message || 'API unavailable', 'error');
  }
}

function toggleStream() {
  if (stream) {
    stream.close();
    stream = null;
    els.connect.textContent = 'Stream';
    setMessage('Stream closed');
    return;
  }
  stream = new EventSource(`${baseUrl()}/stream`);
  stream.addEventListener('snapshot', (event) => {
    snapshot = JSON.parse(event.data);
    renderSymbols();
    render();
    setConnection(snapshot.source?.connected ? 'LIVE' : 'WAITING', snapshot.source?.connected ? 'live' : 'muted');
  });
  stream.onerror = () => {
    setConnection('OFFLINE', 'error');
    setMessage('Stream disconnected', 'error');
  };
  els.connect.textContent = 'Stop';
  setMessage('Stream connected', 'ok');
}

function renderSymbols() {
  const current = selectedSymbol();
  const symbols = Object.keys(snapshot?.symbols || {});
  const next = symbols.length ? symbols : ['MES', 'MNQ'];
  els.symbol.replaceChildren(...next.map((symbol) => {
    const row = snapshot?.symbols?.[symbol] || {};
    const option = document.createElement('option');
    option.value = symbol;
    option.textContent = displaySymbol(symbol, row);
    return option;
  }));
  els.symbol.value = next.includes(current) ? current : next[0];
}

function render() {
  const symbols = snapshot?.symbols || {};
  const row = symbols[selectedSymbol()];
  const levels = row?.levels || [];
  els.sourceState.textContent = snapshot?.source?.state || 'waiting';
  els.symbolCount.textContent = String(Object.keys(symbols).length);
  els.levelCount.textContent = String(levels.length);
  els.capturedAt.textContent = shortTime(row?.capturedAt || snapshot?.capturedAt || '');
  els.freshness.textContent = snapshot?.generatedAt ? shortTime(snapshot.generatedAt) : '--';
  renderStats(row?.stats || {});

  if (!levels.length) {
    els.levelsBody.innerHTML = '<tr><td colspan="4" class="empty">No levels captured</td></tr>';
    return;
  }
  els.levelsBody.replaceChildren(...levels.map(levelRow));
}

function levelRow(level) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><span class="color-dot"></span>${escapeHtml(level.name)}</td>
    <td><span class="kind-chip">${escapeHtml(level.kind)}</span></td>
    <td class="num">${Number(level.price).toFixed(2)}</td>
    <td>${escapeHtml(level.source || '')}</td>
  `;
  tr.querySelector('.color-dot').style.setProperty('--level-color', /^#[0-9a-f]{6}$/i.test(level.color) ? level.color : '#8fa1b5');
  return tr;
}

function renderStats(stats = {}) {
  els.statDd.textContent = formatMetric(stats.dd);
  els.statRi.textContent = formatMetric(stats.riskInterval);
  els.statRes.textContent = formatMetric(stats.resilience);
  els.statMres.textContent = formatMetric(stats.monthlyResilience);
  els.statWres.textContent = formatMetric(stats.weeklyResilience);
  els.statMap.textContent = stats.mapCode || '--';
}

async function copyTradingViewPayload(path) {
  try {
    const response = await fetch(`${baseUrl()}${path}`);
    if (!response.ok) throw new Error(`Export returned ${response.status}`);
    await navigator.clipboard.writeText((await response.text()).trim());
    setMessage('TradingView payload copied', 'ok');
  } catch (err) {
    setMessage(err.message || 'Copy failed', 'error');
  }
}

function selectedSymbol() {
  return els.symbol.value || 'MES';
}

function displaySymbol(symbol, row = {}) {
  const raw = String(row.displaySymbol || symbol || '').toUpperCase();
  if (raw === 'MES') return 'ES';
  if (raw === 'MNQ') return 'NQ';
  return raw || 'MES';
}

function baseUrl() {
  return els.serviceUrl.value.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8765';
}

function setConnection(text, mode) {
  els.connection.textContent = text;
  els.connection.className = `pill ${mode}`;
}

function setMessage(text, mode = '') {
  els.message.textContent = text;
  els.message.className = `message ${mode}`.trim();
}

function shortTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatMetric(value) {
  if (value == null || value === '') return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return number.toFixed(2).replace(/\.?0+$/, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

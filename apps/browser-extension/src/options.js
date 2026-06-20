const els = {
  serviceUrl: document.getElementById('service-url'),
  captureEnabled: document.getElementById('capture-enabled'),
  endpointPatterns: document.getElementById('endpoint-patterns'),
  maxCaptureBytes: document.getElementById('max-capture-bytes'),
  testService: document.getElementById('test-service'),
  permissionStatus: document.getElementById('permission-status'),
  save: document.getElementById('save'),
  reset: document.getElementById('reset'),
  message: document.getElementById('message')
};

let permissionCheckId = 0;

init();

async function init() {
  await load();
  els.save.addEventListener('click', save);
  els.reset.addEventListener('click', reset);
  els.testService.addEventListener('click', testService);
  els.serviceUrl.addEventListener('input', updatePermissionState);
  await updatePermissionState();
}

async function load() {
  const stored = await chrome.storage.local.get(['settingsVersion', 'serviceUrl', 'captureEnabled', 'endpointPatterns', 'maxCaptureBytes']);
  const settings = globalThis.RS_LEVELS.migrateSettings(stored);
  if (settings.settingsVersion !== stored.settingsVersion) {
    await chrome.storage.local.set(settings);
  }
  els.serviceUrl.value = settings.serviceUrl;
  els.captureEnabled.checked = settings.captureEnabled;
  els.endpointPatterns.value = settings.endpointPatterns.join('\n');
  els.maxCaptureBytes.value = String(settings.maxCaptureBytes);
}

async function save() {
  try {
    const settings = globalThis.RS_LEVELS.cleanSettings({
      serviceUrl: els.serviceUrl.value,
      captureEnabled: els.captureEnabled.checked,
      endpointPatterns: els.endpointPatterns.value,
      maxCaptureBytes: Number(els.maxCaptureBytes.value)
    });
    await ensureServiceAccess(settings.serviceUrl);
    await chrome.storage.local.set(settings);
    await updatePermissionState();
    setMessage('Saved', 'ok');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'Save failed', 'error');
  }
}

async function reset() {
  await chrome.storage.local.set(globalThis.RS_LEVELS.cleanSettings(globalThis.RS_LEVELS.defaults));
  await load();
  await updatePermissionState();
  setMessage('Defaults restored', 'ok');
}

async function testService() {
  try {
    const serviceUrl = globalThis.RS_LEVELS.cleanServiceUrl(els.serviceUrl.value);
    await ensureServiceAccess(serviceUrl);
    const health = await fetchHealth(serviceUrl);
    await updatePermissionState();
    const source = health && health.source || {};
    setMessage(`Connected to ${serviceUrl} (${source.state || 'unknown'}).`, 'ok');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'Service check failed', 'error');
  }
}

async function ensureServiceAccess(serviceUrl) {
  const origin = originPattern(serviceUrl);
  const hasAccess = await chrome.permissions.contains({ origins: [origin] });
  if (hasAccess) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error('Service URL permission was not granted');
}

async function updatePermissionState() {
  const checkId = ++permissionCheckId;
  try {
    const serviceUrl = globalThis.RS_LEVELS.cleanServiceUrl(els.serviceUrl.value);
    const origin = originPattern(serviceUrl);
    const hasAccess = await chrome.permissions.contains({ origins: [origin] });
    if (checkId !== permissionCheckId) return;
    els.permissionStatus.textContent = hasAccess ? `Permission granted: ${origin}` : `Permission needed: ${origin}`;
    els.permissionStatus.className = hasAccess ? 'status ok' : 'status warning';
  } catch (err) {
    if (checkId !== permissionCheckId) return;
    els.permissionStatus.textContent = err && err.message ? err.message : 'Invalid service URL';
    els.permissionStatus.className = 'status warning';
  }
}

async function fetchHealth(serviceUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Health check returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function originPattern(serviceUrl) {
  const parsed = new URL(serviceUrl);
  return `${parsed.origin}/*`;
}

function setMessage(text, mode) {
  els.message.textContent = text;
  els.message.className = `message ${mode || ''}`.trim();
}

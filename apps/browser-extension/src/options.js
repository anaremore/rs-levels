const els = {
  serviceUrl: document.getElementById('service-url'),
  captureEnabled: document.getElementById('capture-enabled'),
  endpointPatterns: document.getElementById('endpoint-patterns'),
  maxCaptureBytes: document.getElementById('max-capture-bytes'),
  save: document.getElementById('save'),
  reset: document.getElementById('reset'),
  message: document.getElementById('message')
};

init();

async function init() {
  await load();
  els.save.addEventListener('click', save);
  els.reset.addEventListener('click', reset);
}

async function load() {
  const stored = await chrome.storage.local.get(['serviceUrl', 'captureEnabled', 'endpointPatterns', 'maxCaptureBytes']);
  const settings = globalThis.RS_LEVELS.cleanSettings(stored);
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
    setMessage('Saved', 'ok');
  } catch (err) {
    setMessage(err && err.message ? err.message : 'Save failed', 'error');
  }
}

async function reset() {
  await chrome.storage.local.set(globalThis.RS_LEVELS.cleanSettings(globalThis.RS_LEVELS.defaults));
  await load();
  setMessage('Defaults restored', 'ok');
}

async function ensureServiceAccess(serviceUrl) {
  const origin = originPattern(serviceUrl);
  const hasAccess = await chrome.permissions.contains({ origins: [origin] });
  if (hasAccess) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error('Service URL permission was not granted');
}

function originPattern(serviceUrl) {
  const parsed = new URL(serviceUrl);
  return `${parsed.origin}/*`;
}

function setMessage(text, mode) {
  els.message.textContent = text;
  els.message.className = `message ${mode || ''}`.trim();
}
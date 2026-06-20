(() => {
  const PAGE_SOURCE = 'rs-levels-page';
  const CONTROL_SOURCE = 'rs-levels-content';
  const nonce = createNonce();
  let ready = false;

  injectPageScripts();

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.source !== PAGE_SOURCE || data.nonce !== nonce) return;
    if (data.type === 'capture') {
      chrome.runtime.sendMessage({ type: 'rs-levels.capture', capture: data.capture });
      return;
    }
    if (data.type === 'diagnostic') {
      chrome.runtime.sendMessage({ type: 'rs-levels.capture-diagnostic', stats: data.stats });
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.serviceUrl || changes.captureEnabled || changes.endpointPatterns || changes.maxCaptureBytes) {
      syncSettings();
    }
  });

  async function injectPageScripts() {
    await injectScript('src/capture-rules.js');
    await injectScript('src/page-hook.js', { rsLevelsNonce: nonce });
    ready = true;
    await syncSettings();
  }

  function injectScript(path, dataset = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(path);
      script.async = false;
      Object.entries(dataset).forEach(([key, value]) => {
        script.dataset[key] = value;
      });
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to inject ${path}`));
      (document.documentElement || document.head).appendChild(script);
    });
  }

  async function syncSettings() {
    if (!ready) return;
    const stored = await chrome.storage.local.get(['captureEnabled', 'endpointPatterns', 'maxCaptureBytes']);
    const settings = globalThis.RS_LEVELS.cleanSettings(stored);
    window.postMessage({
      source: CONTROL_SOURCE,
      type: 'settings',
      nonce,
      captureEnabled: settings.captureEnabled,
      endpointPatterns: settings.endpointPatterns,
      maxCaptureBytes: settings.maxCaptureBytes
    }, window.location.origin);
  }

  function createNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
})();

(() => {
  if (globalThis.__RS_LEVELS_CONTENT_SCRIPT_ACTIVE__) {
    if (typeof globalThis.__RS_LEVELS_RECONNECT === 'function') {
      globalThis.__RS_LEVELS_RECONNECT();
    }
    return;
  }
  globalThis.__RS_LEVELS_CONTENT_SCRIPT_ACTIVE__ = true;

  const PAGE_SOURCE = 'rs-levels-page';
  const CONTROL_SOURCE = 'rs-levels-content';

  globalThis.__RS_LEVELS_RECONNECT = () => {
    reportContentDiagnostic('reconnect-requested');
    syncSettings();
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.source !== PAGE_SOURCE) return;
    if (data.type === 'capture') {
      chrome.runtime.sendMessage({ type: 'rs-levels.capture', capture: data.capture });
      return;
    }
    if (data.type === 'diagnostic') {
      chrome.runtime.sendMessage({ type: 'rs-levels.capture-diagnostic', stats: data.stats });
      const reason = data.stats && data.stats.lastReason || '';
      if (reason === 'hook-installed' || reason === 'hook-reconnected') {
        syncSettings();
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.serviceUrl || changes.captureEnabled || changes.endpointPatterns || changes.maxCaptureBytes) {
      syncSettings();
    }
  });

  reportContentDiagnostic('content-ready');
  syncSettings();

  async function syncSettings() {
    try {
      const stored = await chrome.storage.local.get(['settingsVersion', 'captureEnabled', 'endpointPatterns', 'maxCaptureBytes']);
      const settings = globalThis.RS_LEVELS.migrateSettings(stored);
      if (settings.settingsVersion !== stored.settingsVersion) {
        await chrome.storage.local.set(settings);
      }
      window.postMessage({
        source: CONTROL_SOURCE,
        type: 'settings',
        captureEnabled: settings.captureEnabled,
        endpointPatterns: settings.endpointPatterns,
        maxCaptureBytes: settings.maxCaptureBytes
      }, window.location.origin);
      reportContentDiagnostic('settings-sent');
    } catch (err) {
      reportContentDiagnostic('settings-failed', err && err.message ? err.message : 'Settings sync failed');
    }
  }

  function reportContentDiagnostic(reason, detail = '') {
    chrome.runtime.sendMessage({
      type: 'rs-levels.content-diagnostic',
      diagnostic: {
        reason,
        detail,
        at: new Date().toISOString()
      }
    });
  }
})();

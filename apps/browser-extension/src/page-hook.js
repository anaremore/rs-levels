(() => {
  const SOURCE = 'rs-levels-page';
  const CONTROL_SOURCE = 'rs-levels-content';
  const NONCE = document.currentScript && document.currentScript.dataset.rsLevelsNonce || '';
  const TARGET_ORIGIN = window.location.origin;
  const rules = globalThis.RS_LEVELS_CAPTURE_RULES;
  let settings = {
    captureEnabled: false,
    endpointPatterns: [],
    maxCaptureBytes: 1024 * 1024
  };

  if (!NONCE || !rules) return;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== TARGET_ORIGIN) return;
    const data = event.data || {};
    if (data.source !== CONTROL_SOURCE || data.type !== 'settings' || data.nonce !== NONCE) return;
    settings = {
      captureEnabled: data.captureEnabled === true,
      endpointPatterns: Array.isArray(data.endpointPatterns) ? data.endpointPatterns : [],
      maxCaptureBytes: Number.isFinite(Number(data.maxCaptureBytes)) ? Number(data.maxCaptureBytes) : 1024 * 1024
    };
  });

  function allowed(url) {
    if (!settings.captureEnabled) return false;
    return rules.isAllowedCaptureUrl(url, settings.endpointPatterns);
  }

  function endpoint(url) {
    return rules.endpointFromUrl(url, window.location.href);
  }

  function publish(capture) {
    window.postMessage({ source: SOURCE, type: 'capture', nonce: NONCE, capture }, TARGET_ORIGIN);
  }

  async function readResponse(response, requestUrl, method) {
    const url = response.url || requestUrl;
    if (!allowed(url)) return;
    const length = Number(response.headers.get('content-length') || 0);
    if (length > settings.maxCaptureBytes) return;
    try {
      const body = await response.clone().text();
      if (body.length > settings.maxCaptureBytes) return;
      publish({
        url,
        endpoint: endpoint(url),
        method,
        status: response.status,
        capturedAt: new Date().toISOString(),
        body
      });
    } catch (_err) {
      // Some responses cannot be cloned or read by page script context.
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function rsLevelsFetch(input, init) {
      const response = await originalFetch.apply(this, arguments);
      const requestUrl = typeof input === 'string' ? input : input && input.url;
      const method = (init && init.method) || (input && input.method) || 'GET';
      readResponse(response, requestUrl, method);
      return response;
    };
  }

  const OriginalXhr = window.XMLHttpRequest;
  if (typeof OriginalXhr === 'function') {
    window.XMLHttpRequest = function RsLevelsXhr() {
      const xhr = new OriginalXhr();
      let requestUrl = '';
      let method = 'GET';
      const originalOpen = xhr.open;
      xhr.open = function rsLevelsOpen(nextMethod, nextUrl) {
        method = nextMethod || 'GET';
        requestUrl = String(nextUrl || '');
        return originalOpen.apply(xhr, arguments);
      };
      xhr.addEventListener('load', () => {
        if (!allowed(requestUrl)) return;
        if (xhr.responseType && xhr.responseType !== 'text') return;
        let body = '';
        try {
          body = typeof xhr.responseText === 'string' ? xhr.responseText : '';
        } catch (_err) {
          return;
        }
        if (!body || body.length > settings.maxCaptureBytes) return;
        publish({
          url: requestUrl,
          endpoint: endpoint(requestUrl),
          method,
          status: xhr.status,
          capturedAt: new Date().toISOString(),
          body
        });
      });
      return xhr;
    };
  }
})();
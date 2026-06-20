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
  const stats = {
    observedCount: 0,
    ignoredCount: 0,
    skippedDisabledCount: 0,
    skippedTooLargeCount: 0,
    skippedNonTextCount: 0,
    skippedEmptyCount: 0,
    readErrorCount: 0,
    publishedCount: 0,
    lastReason: '',
    lastDiagnosticAt: ''
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

  function skipReason(url) {
    if (!settings.captureEnabled) return 'disabled';
    if (!rules.isAllowedCaptureUrl(url, settings.endpointPatterns)) return 'allowlist';
    return '';
  }

  function endpoint(url) {
    return rules.endpointFromUrl(url, window.location.href);
  }

  function publish(capture) {
    stats.publishedCount += 1;
    publishDiagnostic('published');
    window.postMessage({ source: SOURCE, type: 'capture', nonce: NONCE, capture }, TARGET_ORIGIN);
  }

  function publishDiagnostic(reason) {
    stats.lastReason = reason;
    stats.lastDiagnosticAt = new Date().toISOString();
    window.postMessage({
      source: SOURCE,
      type: 'diagnostic',
      nonce: NONCE,
      stats: { ...stats }
    }, TARGET_ORIGIN);
  }

  async function readResponse(response, requestUrl, method) {
    const url = response.url || requestUrl;
    stats.observedCount += 1;
    const reason = skipReason(url);
    if (reason === 'disabled') {
      stats.skippedDisabledCount += 1;
      publishDiagnostic(reason);
      return;
    }
    if (reason === 'allowlist') {
      stats.ignoredCount += 1;
      publishDiagnostic(reason);
      return;
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > settings.maxCaptureBytes) {
      stats.skippedTooLargeCount += 1;
      publishDiagnostic('too-large');
      return;
    }
    if (!rules.isTextLikeContentType(response.headers.get('content-type') || '')) {
      stats.skippedNonTextCount += 1;
      publishDiagnostic('non-text');
      return;
    }
    try {
      const body = await response.clone().text();
      if (!body) {
        stats.skippedEmptyCount += 1;
        publishDiagnostic('empty');
        return;
      }
      if (body.length > settings.maxCaptureBytes) {
        stats.skippedTooLargeCount += 1;
        publishDiagnostic('too-large');
        return;
      }
      publish({
        url,
        endpoint: endpoint(url),
        method,
        status: response.status,
        capturedAt: new Date().toISOString(),
        body
      });
    } catch (_err) {
      stats.readErrorCount += 1;
      publishDiagnostic('read-error');
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
        stats.observedCount += 1;
        const reason = skipReason(requestUrl);
        if (reason === 'disabled') {
          stats.skippedDisabledCount += 1;
          publishDiagnostic(reason);
          return;
        }
        if (reason === 'allowlist') {
          stats.ignoredCount += 1;
          publishDiagnostic(reason);
          return;
        }
        if (xhr.responseType && xhr.responseType !== 'text') {
          stats.skippedNonTextCount += 1;
          publishDiagnostic('non-text');
          return;
        }
        if (!rules.isTextLikeContentType(responseHeader(xhr, 'content-type'))) {
          stats.skippedNonTextCount += 1;
          publishDiagnostic('non-text');
          return;
        }
        let body = '';
        try {
          body = typeof xhr.responseText === 'string' ? xhr.responseText : '';
        } catch (_err) {
          stats.readErrorCount += 1;
          publishDiagnostic('read-error');
          return;
        }
        if (!body) {
          stats.skippedEmptyCount += 1;
          publishDiagnostic('empty');
          return;
        }
        if (body.length > settings.maxCaptureBytes) {
          stats.skippedTooLargeCount += 1;
          publishDiagnostic('too-large');
          return;
        }
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

  function responseHeader(xhr, name) {
    try {
      return xhr.getResponseHeader(name) || '';
    } catch (_err) {
      return '';
    }
  }
})();

(() => {
  function isAllowedCaptureUrl(url, patterns) {
    const text = String(url || '').toLowerCase();
    if (!text) return false;
    if (!Array.isArray(patterns) || patterns.length === 0) return false;
    return patterns.some((pattern) => {
      const clean = String(pattern || '').trim().toLowerCase();
      return clean.length > 0 && text.includes(clean);
    });
  }

  function endpointFromUrl(url, baseHref = '') {
    try {
      const parsed = new URL(url, baseHref || undefined);
      return parsed.pathname;
    } catch (_err) {
      return String(url || '');
    }
  }

  function isTextLikeContentType(value) {
    const text = String(value || '').split(';')[0].trim().toLowerCase();
    if (!text) return true;
    return text.startsWith('text/') ||
      text === 'application/json' ||
      text === 'application/x-ndjson' ||
      text === 'application/xml' ||
      text === 'application/javascript' ||
      text === 'application/x-www-form-urlencoded' ||
      text.endsWith('+json') ||
      text.endsWith('+xml');
  }

  globalThis.RS_LEVELS_CAPTURE_RULES = {
    isAllowedCaptureUrl,
    endpointFromUrl,
    isTextLikeContentType
  };
})();

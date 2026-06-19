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

  globalThis.RS_LEVELS_CAPTURE_RULES = {
    isAllowedCaptureUrl,
    endpointFromUrl
  };
})();
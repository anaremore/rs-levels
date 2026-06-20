(() => {
  const defaults = {
    serviceUrl: 'http://127.0.0.1:8765',
    captureEnabled: true,
    endpointPatterns: ['level', 'levels', 'ddband', 'dd-band', 'zone', 'pivot'],
    symbols: ['MES', 'MNQ'],
    maxCaptureBytes: 1024 * 1024
  };

  function cleanServiceUrl(value) {
    const raw = String(value || defaults.serviceUrl).trim();
    const parsed = new URL(raw || defaults.serviceUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Service URL must use http or https');
    }
    parsed.hash = '';
    parsed.search = '';
    return parsed.href.replace(/\/+$/, '');
  }

  function cleanPatterns(value) {
    const rows = Array.isArray(value) ? value : String(value || '').split(/\r?\n|,/);
    const clean = rows.map((row) => String(row).trim()).filter(Boolean).slice(0, 50);
    return clean.length ? clean : defaults.endpointPatterns.slice();
  }

  function cleanMaxBytes(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return defaults.maxCaptureBytes;
    return Math.min(5 * 1024 * 1024, Math.max(1024, Math.trunc(number)));
  }

  function nonNegativeInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.trunc(number));
  }

  function normalizeDisplaySymbol(value) {
    const text = String(value || '').trim().toUpperCase();
    if (text.includes('NQ')) return 'MNQ';
    if (text.includes('ES')) return 'MES';
    return text || 'MES';
  }

  function cleanSettings(input = {}) {
    return {
      serviceUrl: cleanServiceUrl(input.serviceUrl),
      captureEnabled: input.captureEnabled !== false,
      endpointPatterns: cleanPatterns(input.endpointPatterns),
      maxCaptureBytes: cleanMaxBytes(input.maxCaptureBytes)
    };
  }

  function symbolLevelCount(status = {}, symbol = '') {
    const summaries = Array.isArray(status.symbolSummaries) ? status.symbolSummaries : [];
    if (!summaries.length) return null;
    const target = normalizeDisplaySymbol(symbol);
    const match = summaries.find((summary) => normalizeDisplaySymbol(summary.symbol) === target);
    return match ? nonNegativeInteger(match.levelCount) : 0;
  }

  function selectedSymbolIssue(status = {}, symbol = '') {
    const levelCount = nonNegativeInteger(status.levelCount);
    if (levelCount < 1) return 'No captured levels are available yet.';
    const selectedLevelCount = symbolLevelCount(status, symbol);
    if (selectedLevelCount === 0) {
      return `No captured levels are available for ${normalizeDisplaySymbol(symbol)}.`;
    }
    return '';
  }

  function tradingViewCopyIssue(status = {}, symbol = '') {
    const source = status.source || {};
    const symbolIssue = selectedSymbolIssue(status, symbol);
    if (symbolIssue) return symbolIssue;
    if (source.state === 'stale') return 'Captured levels are stale. Refresh RocketScooter before copying TradingView.';
    if (source.connected === false) return 'Captured levels are not live. Refresh RocketScooter before copying TradingView.';
    return '';
  }

  globalThis.RS_LEVELS = {
    defaults,
    cleanServiceUrl,
    cleanPatterns,
    cleanSettings,
    selectedSymbolIssue,
    symbolLevelCount,
    tradingViewCopyIssue
  };
})();

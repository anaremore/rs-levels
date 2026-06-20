(() => {
  const defaults = {
    settingsVersion: 4,
    serviceUrl: 'http://127.0.0.1:8765',
    captureEnabled: true,
    endpointPatterns: [
      'level',
      'levels',
      'line',
      'lines',
      'chart',
      'charts',
      'ddband',
      'ddbands',
      'dd-band',
      'band',
      'bands',
      'zone',
      'zones',
      'pivot',
      'pivots',
      'reference',
      'references',
      'indicator',
      'indicators',
      'hpa',
      'tview/settings',
      'tview/indicators',
      'liq-map',
      'liquidity',
      'dyn-hp',
      'db/sp',
      'db/nq'
    ],
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
    const clean = uniquePatterns(rows.map((row) => String(row).trim()).filter(Boolean)).slice(0, 50);
    return clean.length ? clean : defaults.endpointPatterns.slice();
  }

  function mergeEndpointPatterns(current, additions) {
    return uniquePatterns([
      ...cleanPatterns(current),
      ...(Array.isArray(additions) ? additions : cleanPatterns(additions))
    ]).slice(0, 50);
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
    const parts = text.split(/[^A-Z0-9]+/).filter(Boolean);
    if (parts.some((part) => part === 'MNQ' || part === 'NQ' || part === 'ENQ' || /^M?NQ[FGHJKMNQUVXZ]\d{1,2}$/.test(part) || /^ENQ[FGHJKMNQUVXZ]\d{1,2}$/.test(part))) return 'MNQ';
    if (parts.some((part) => part === 'MES' || part === 'ES' || part === 'EP' || /^M?ES[FGHJKMNQUVXZ]\d{1,2}$/.test(part) || /^EP[FGHJKMNQUVXZ]\d{1,2}$/.test(part))) return 'MES';
    if (/\bNASDAQ\b/.test(text) || /\bNQ[-\s]?100\b/.test(text)) return 'MNQ';
    if (/\bS\s*&\s*P\s*500\b/.test(text) || /\bS\s+AND\s+P\s+500\b/.test(text) || /\bSPX?\s*500\b/.test(text)) return 'MES';
    return text || 'MES';
  }

  function cleanSettings(input = {}) {
    return {
      settingsVersion: defaults.settingsVersion,
      serviceUrl: cleanServiceUrl(input.serviceUrl),
      captureEnabled: input.captureEnabled !== false,
      endpointPatterns: cleanPatterns(input.endpointPatterns),
      maxCaptureBytes: cleanMaxBytes(input.maxCaptureBytes)
    };
  }

  function migrateSettings(input = {}) {
    const settings = cleanSettings(input);
    const version = Number(input.settingsVersion);
    if (!Number.isInteger(version) || version < defaults.settingsVersion) {
      settings.endpointPatterns = mergeEndpointPatterns(input.endpointPatterns, defaults.endpointPatterns);
    }
    return settings;
  }

  function uniquePatterns(rows) {
    const out = [];
    const seen = new Set();
    rows.forEach((row) => {
      const clean = String(row || '').trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    });
    return out;
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

  function tradingViewBundleCopyIssue(status = {}) {
    const source = status.source || {};
    const levelCount = nonNegativeInteger(status.levelCount);
    if (levelCount < 1) return 'No captured levels are available yet.';
    if (source.state === 'stale') return 'Captured levels are stale. Refresh RocketScooter before copying TradingView.';
    if (source.connected === false) return 'Captured levels are not live. Refresh RocketScooter before copying TradingView.';
    return '';
  }

  globalThis.RS_LEVELS = {
    defaults,
    cleanServiceUrl,
    cleanPatterns,
    mergeEndpointPatterns,
    cleanSettings,
    migrateSettings,
    normalizeDisplaySymbol,
    selectedSymbolIssue,
    symbolLevelCount,
    tradingViewBundleCopyIssue,
    tradingViewCopyIssue
  };
})();

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
    symbols: ['ES', 'NQ'],
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
    if (parts.some((part) => part === 'MNQ' || part === 'NQ' || part === 'ENQ' || /^M?NQ[FGHJKMNQUVXZ](?:\d{1,2})?$/.test(part) || /^ENQ[FGHJKMNQUVXZ](?:\d{1,2})?$/.test(part))) return 'MNQ';
    if (parts.some((part) => part === 'MES' || part === 'ES' || part === 'EP' || /^M?ES[FGHJKMNQUVXZ](?:\d{1,2})?$/.test(part) || /^EP[FGHJKMNQUVXZ](?:\d{1,2})?$/.test(part))) return 'MES';
    if (/\bNASDAQ\b/.test(text) || /\bNQ[-\s]?100\b/.test(text)) return 'MNQ';
    if (/\bS\s*&\s*P\s*500\b/.test(text) || /\bS\s+AND\s+P\s+500\b/.test(text) || /\bSPX?\s*500\b/.test(text)) return 'MES';
    return text || 'MES';
  }

  function publicDisplaySymbol(value) {
    const normalized = normalizeDisplaySymbol(value);
    if (normalized === 'MES') return 'ES';
    if (normalized === 'MNQ') return 'NQ';
    return normalized;
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
      return `No captured levels are available for ${publicDisplaySymbol(symbol)}.`;
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

  function cleanTradingViewPayload(text) {
    const payload = String(text || '').trim();
    const parts = payload.split('|');
    if (parts.length < 6 || parts[0] !== 'RSLEVELS' || parts[1] !== '2' || (parts.length - 3) % 3 !== 0) {
      throw new Error('Local service returned an unsupported TradingView payload. Restart the local service and reload the extension.');
    }
    for (let index = 3; index < parts.length; index += 3) {
      const symbol = publicDisplaySymbol(parts[index]);
      if (symbol !== 'ES' && symbol !== 'NQ') {
        throw new Error('Local service returned a TradingView payload for an unsupported symbol.');
      }
      if (!validTradingViewLevelRows(parts[index + 2])) {
        throw new Error('Local service returned an invalid TradingView payload.');
      }
    }
    return payload;
  }

  function validTradingViewLevelRows(text) {
    const rows = String(text || '').split(';').filter(Boolean);
    if (!rows.length) return false;
    return rows.every((row) => {
      const fields = row.split(',');
      return fields.length >= 3
        && fields[0].trim()
        && Number.isFinite(Number(fields[1]))
        && fields[2].trim();
    });
  }

  function captureToTradingViewSnapshot(capture = {}) {
    const body = captureBody(capture.body);
    const levels = Array.isArray(body.levels) ? body.levels : [];
    const defaultSymbol = body.symbol || body.displaySymbol || '';
    const symbols = new Map();
    levels.forEach((level) => {
      const symbol = publicDisplaySymbol(level && (level.symbol || level.displaySymbol) || defaultSymbol);
      if (symbol !== 'ES' && symbol !== 'NQ') return;
      const price = Number(level.price);
      const name = tradingViewField(tradingViewLevelName(level));
      const kind = tradingViewField(level && (level.kind || inferTradingViewKind(name)));
      if (!name || !Number.isFinite(price) || !kind) return;
      if (!symbols.has(symbol)) {
        symbols.set(symbol, {
          symbol,
          capturedAt: String(level.capturedAt || body.capturedAt || capture.capturedAt || new Date().toISOString()),
          levels: [],
          seen: new Set()
        });
      }
      const row = `${name},${tradingViewPrice(price)},${kind}`;
      const group = symbols.get(symbol);
      if (group.seen.has(row)) return;
      group.seen.add(row);
      group.levels.push(row);
    });
    const rows = Array.from(symbols.values())
      .filter((row) => row.levels.length)
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((row) => ({
        symbol: row.symbol,
        capturedAt: row.capturedAt,
        levels: row.levels
      }));
    return rows.length ? {
      generatedAt: String(body.capturedAt || capture.capturedAt || new Date().toISOString()),
      symbols: rows
    } : null;
  }

  function tradingViewPayloadFromSnapshot(snapshot, scope = 'ALL') {
    if (!snapshot || !Array.isArray(snapshot.symbols)) return '';
    const selected = publicDisplaySymbol(scope);
    const rows = snapshot.symbols
      .filter((row) => selected === 'ALL' || selected === row.symbol)
      .filter((row) => row && row.symbol && Array.isArray(row.levels) && row.levels.length)
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (!rows.length) return '';
    return cleanTradingViewPayload([
      'RSLEVELS',
      '2',
      tradingViewField(snapshot.generatedAt || new Date().toISOString()),
      ...rows.flatMap((row) => [
        tradingViewField(row.symbol),
        tradingViewField(row.capturedAt),
        row.levels.join(';')
      ])
    ].join('|'));
  }

  function captureBody(body) {
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    if (typeof body !== 'string') return {};
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_err) {
      return {};
    }
  }

  function tradingViewLevelName(level = {}) {
    const raw = tradingViewField(level.name || level.label || level.text || 'Level');
    const upper = raw.toUpperCase();
    if (upper.includes('PREVDAYCLOSE') || upper.includes('PREV DAY CLOSE')) return 'Prev Close';
    if (upper.includes('MIDGAP') || upper.includes('HALFGAP') || upper.includes('HALF GAP')) return 'Mid Gap';
    if (upper.includes('LASTOPEN') || (upper.includes('OPEN') && !upper.includes('CLOSE'))) return 'Open';
    if (upper.includes('CLOSE')) return 'Close';
    if (upper.includes('OVNMHP')) return 'OVNMHP';
    if (upper.includes('OVNHP')) return 'OVNHP';
    if (upper.includes('CAT')) return 'CAT';
    if (/\bYL\b/.test(upper) || upper.includes('YELLOW LINE')) return 'Yellow Line';
    if (/\bRL\b/.test(upper) || upper.includes('RED LINE')) return 'Red Line';
    if (upper.includes('MHP')) return 'MHP';
    if (upper.includes('HP')) return 'HP';
    if (upper.includes('DD')) return 'DD';
    return raw || 'Level';
  }

  function inferTradingViewKind(name) {
    const upper = String(name || '').toUpperCase();
    if (upper.includes('BRZ') || upper.includes('BEAR')) return 'zone-bear';
    if (upper.includes('BZ') || upper.includes('BULL')) return 'zone-bull';
    if (upper.includes('CAT')) return 'cat';
    if (/\bYL\b/.test(upper) || upper.includes('YELLOW LINE')) return 'yellow-line';
    if (/\bRL\b/.test(upper) || upper.includes('RED LINE')) return 'red-line';
    if (upper.includes('MHP')) return 'mhp';
    if (upper.includes('HP')) return 'hp';
    if (upper.includes('DD')) return 'dd-band';
    if (upper.includes('OPEN') || upper.includes('CLOSE') || upper.includes('GAP')) return 'open-close';
    return 'reference';
  }

  function tradingViewField(value) {
    return String(value ?? '')
      .replace(/[|;,"\[\]\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tradingViewPrice(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : '';
  }

  globalThis.RS_LEVELS = {
    defaults,
    cleanServiceUrl,
    cleanPatterns,
    mergeEndpointPatterns,
    cleanSettings,
    migrateSettings,
    normalizeDisplaySymbol,
    publicDisplaySymbol,
    selectedSymbolIssue,
    symbolLevelCount,
    cleanTradingViewPayload,
    captureToTradingViewSnapshot,
    tradingViewPayloadFromSnapshot,
    tradingViewBundleCopyIssue,
    tradingViewCopyIssue
  };
})();

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

  function summaryHasStats(summary = {}) {
    const stats = summary.stats || {};
    return Boolean(stats.mapCode) ||
      [stats.dd, stats.riskInterval, stats.resilience, stats.monthlyResilience, stats.weeklyResilience]
        .some((value) => value != null && value !== '' && Number.isFinite(Number(value)));
  }

  function summaryHasDisplayData(summary = {}) {
    return nonNegativeInteger(summary.levelCount) > 0 || summaryHasStats(summary);
  }

  function hasAnyDisplayData(status = {}) {
    if (nonNegativeInteger(status.levelCount) > 0) return true;
    const summaries = Array.isArray(status.symbolSummaries) ? status.symbolSummaries : [];
    return summaries.some(summaryHasStats);
  }

  function selectedSymbolIssue(status = {}, symbol = '') {
    if (!hasAnyDisplayData(status)) return 'No captured display data is available yet.';
    const summaries = Array.isArray(status.symbolSummaries) ? status.symbolSummaries : [];
    if (summaries.length) {
      const target = normalizeDisplaySymbol(symbol);
      const match = summaries.find((summary) => normalizeDisplaySymbol(summary.symbol) === target);
      if (!match || !summaryHasDisplayData(match)) {
        return `No captured display data is available for ${publicDisplaySymbol(symbol)}.`;
      }
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
    if (!hasAnyDisplayData(status)) return 'No captured display data is available yet.';
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
    const defaultSymbol = body.symbol || body.displaySymbol || '';
    const symbols = new Map();
    const ensureSymbol = (symbolInput, capturedAtInput) => {
      const symbol = publicDisplaySymbol(symbolInput);
      if (symbol !== 'ES' && symbol !== 'NQ') return null;
      if (!symbols.has(symbol)) {
        symbols.set(symbol, {
          symbol,
          capturedAt: String(capturedAtInput || body.capturedAt || capture.capturedAt || new Date().toISOString()),
          levels: [],
          pendingLevels: [],
          ddBandPrices: [],
          seen: new Set()
        });
      }
      return symbols.get(symbol);
    };
    const addPayloadRow = (symbolInput, capturedAtInput, row) => {
      const group = ensureSymbol(symbolInput, capturedAtInput);
      if (!group || !row || group.seen.has(row)) return;
      group.seen.add(row);
      group.levels.push(row);
    };
    captureDisplayLevels(body, defaultSymbol).forEach((level) => {
      const symbol = publicDisplaySymbol(level && (level.symbol || level.displaySymbol) || defaultSymbol);
      if (symbol !== 'ES' && symbol !== 'NQ') return;
      const price = Number(level.price);
      const name = tradingViewField(tradingViewLevelName(level));
      const kind = tradingViewField(tradingViewLevelKind(level, name));
      if (!name || !Number.isFinite(price) || !kind) return;
      const group = ensureSymbol(symbol, level.capturedAt);
      if (group && kind === 'dd-band' && !group.ddBandPrices.includes(price)) group.ddBandPrices.push(price);
      if (group) {
        group.pendingLevels.push({
          name,
          price,
          kind,
          capturedAt: level.capturedAt
        });
      }
    });
    for (const group of symbols.values()) {
      normalizeTradingViewPayloadRows(group.pendingLevels).forEach((level) => {
        addPayloadRow(group.symbol, level.capturedAt || group.capturedAt, `${tradingViewField(level.name)},${tradingViewPrice(level.price)},${tradingViewField(level.kind)}`);
      });
    }
    const statsGroups = captureStatsGroups(body);
    const statSymbols = new Set([...statsGroups.keys(), ...symbols.keys()]);
    for (const symbol of statSymbols) {
      const group = symbols.get(symbol);
      const stats = statsWithDerivedRiskInterval(statsGroups.get(symbol), group && group.ddBandPrices);
      for (const row of tradingViewStatsRows(stats)) {
        addPayloadRow(symbol, body.capturedAt || capture.capturedAt, row);
      }
    }
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

  function captureDisplayLevels(body = {}, defaultSymbol = '') {
    const out = [];
    const add = (level) => {
      if (!level || typeof level !== 'object' || Array.isArray(level)) return;
      out.push(level);
    };

    if (Array.isArray(body.levels)) {
      body.levels.forEach(add);
    }

    if (Array.isArray(body.chartLines)) {
      body.chartLines.forEach((line) => {
        const name = displayLineName(line);
        if (!name) return;
        add({
          symbol: line.symbol || line.displaySymbol || line.index || line.chart || defaultSymbol,
          name,
          price: line.price,
          kind: line.kind || manualLineKindFromColor(levelColor(line)),
          color: levelColor(line),
          capturedAt: line.capturedAt || body.capturedAt
        });
      });
    }

    if (Array.isArray(body.referenceLines)) {
      body.referenceLines.forEach((line) => {
        const name = displayLineName(line);
        if (!name) return;
        add({
          symbol: line.symbol || line.displaySymbol || line.index || line.chart || defaultSymbol,
          name,
          price: line.price,
          kind: line.kind || manualLineKindFromColor(levelColor(line)),
          color: levelColor(line),
          capturedAt: line.capturedAt || body.capturedAt
        });
      });
    }

    return out;
  }

  function captureStatsGroups(body = {}) {
    const groups = new Map();
    const merge = (symbolInput, statsInput) => {
      const symbol = publicDisplaySymbol(symbolInput);
      if (symbol !== 'ES' && symbol !== 'NQ') return;
      const stats = normalizeStatsAliases(statsInput);
      if (!hasStats(stats)) return;
      groups.set(symbol, mergeStats(groups.get(symbol), stats));
    };

    if (body.stats && typeof body.stats === 'object' && !Array.isArray(body.stats)) {
      Object.entries(body.stats).forEach(([key, value]) => merge(key, value));
    }
    const headerBar = body.headerBar && typeof body.headerBar === 'object' && !Array.isArray(body.headerBar) ? body.headerBar : {};
    const sp = headerBar.sp500 || headerBar.SP500 || headerBar.es || headerBar.ES;
    const nq = headerBar.nq100 || headerBar.NQ100 || headerBar.nq || headerBar.NQ;
    const spStats = normalizeStatsAliases(sp || {});
    if (hasStats(spStats)) merge('ES', spStats);
    if (nq && typeof nq === 'object') merge('NQ', { ...(spStats.dd == null ? {} : { dd: spStats.dd }), ...nq });

    const mapCodes = body.mapCodes && typeof body.mapCodes === 'object' && !Array.isArray(body.mapCodes) ? body.mapCodes : {};
    Object.entries(mapCodes).forEach(([key, value]) => {
      const mapCode = mapCodeFromNode(value);
      if (mapCode && /^(SPY|SPX|SP500|ES|MES)$/i.test(key)) merge('ES', { mapCode });
      if (mapCode && /^(QQQ|NDX|NQ100|NQ|MNQ)$/i.test(key)) merge('NQ', { mapCode });
    });
    return groups;
  }

  function normalizeStatsAliases(stats = {}) {
    return {
      dd: firstFinite(stats.dd, stats.ddRatio),
      riskInterval: firstFinite(stats.riskInterval, stats.ri, stats.RI, stats.risk, stats.riskInt, stats['Risk Interval']),
      resilience: firstFinite(stats.resilience, stats.res, stats.dailyResilience),
      monthlyResilience: firstFinite(stats.monthlyResilience, stats.mres, stats.resilience2),
      weeklyResilience: firstFinite(stats.weeklyResilience, stats.wres, stats.resilience3),
      mapCode: mapCodeFromNode(stats)
    };
  }

  function mergeStats(existing = {}, next = {}) {
    return {
      dd: next.dd == null ? existing.dd : next.dd,
      riskInterval: next.riskInterval == null ? existing.riskInterval : next.riskInterval,
      resilience: next.resilience == null ? existing.resilience : next.resilience,
      monthlyResilience: next.monthlyResilience == null ? existing.monthlyResilience : next.monthlyResilience,
      weeklyResilience: next.weeklyResilience == null ? existing.weeklyResilience : next.weeklyResilience,
      mapCode: next.mapCode || existing.mapCode || ''
    };
  }

  function statsWithDerivedRiskInterval(stats = {}, ddBandPrices = []) {
    const clean = stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : {};
    if (clean.riskInterval != null) return clean;
    const derived = riskIntervalFromDdBandPrices(ddBandPrices);
    return derived == null ? clean : { ...clean, riskInterval: derived };
  }

  function riskIntervalFromDdBandPrices(prices = []) {
    const unique = Array.from(new Set((Array.isArray(prices) ? prices : [])
      .map((price) => firstFinite(price))
      .filter((price) => price != null)
      .map((price) => Number(price.toFixed(6)))))
      .sort((a, b) => a - b);
    if (unique.length < 2) return null;
    const derived = (unique[unique.length - 1] - unique[0]) / 2;
    return derived > 0 ? Number(derived.toFixed(6)) : null;
  }

  function tradingViewStatsRows(stats = {}) {
    const rows = [];
    if (stats.dd != null) rows.push(`DD,${tradingViewPrice(stats.dd)},stat`);
    if (stats.riskInterval != null) rows.push(`RI,${tradingViewPrice(stats.riskInterval)},stat`);
    if (stats.resilience != null) rows.push(`Res,${tradingViewPrice(stats.resilience)},stat`);
    if (stats.monthlyResilience != null) rows.push(`MRes,${tradingViewPrice(stats.monthlyResilience)},stat`);
    if (stats.weeklyResilience != null) rows.push(`WRes,${tradingViewPrice(stats.weeklyResilience)},stat`);
    if (stats.mapCode) rows.push(`${tradingViewField(`Map ${stats.mapCode}`)},0,stat`);
    return rows;
  }

  function hasStats(stats = {}) {
    return Boolean(stats.mapCode) ||
      [stats.dd, stats.riskInterval, stats.resilience, stats.monthlyResilience, stats.weeklyResilience].some((value) => value != null);
  }

  function firstFinite(...values) {
    for (const value of values) {
      if (value == null || value === '') continue;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  function mapCodeFromNode(node = {}) {
    if (!node || typeof node !== 'object') return '';
    const direct = tradingViewField(node.mapCode || node.map || node.liquidityMap || node.code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 12);
    if (direct) return direct;
    return [node.BBrMr, node.zone, node.LS, node.hedging, node.UD, node.timePressure]
      .map((part) => tradingViewField(part).toUpperCase().replace(/[^A-Z]/g, ''))
      .filter(Boolean)
      .join('')
      .slice(0, 12);
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
    const colorName = manualLineNameFromColor(levelColor(level));
    const raw = tradingViewField(level.name || level.label || level.text || level.title || colorName || 'Level');
    const cleanedName = cleanTradingViewLevelName(raw);
    const explicitKind = canonicalTradingViewKind(level.kind);
    const zoneName = zoneBoundaryDisplayName(raw, explicitKind);
    if (zoneName) return zoneName;
    if (explicitKind === 'red-line') return 'Red Line';
    if (explicitKind === 'yellow-line') return 'Yellow Line';
    if (explicitKind === 'cat') return 'CAT';
    if (isDrawingObjectName(raw) && colorName) return colorName;
    const upper = raw.toUpperCase();
    const compactUpper = upper.replace(/[^A-Z0-9]+/g, '');
    if (upper.includes('PREVDAYCLOSE') || upper.includes('PREV DAY CLOSE')) return 'Prev Close';
    if (isHalfGapName(raw)) return 'Half Gap';
    if (upper.includes('LASTOPEN') || (upper.includes('OPEN') && !upper.includes('CLOSE'))) return 'Open';
    if (upper.includes('CLOSE')) return 'Close';
    if (upper.includes('OVNMHP')) return 'OVNMHP';
    if (upper.includes('OVNHP')) return 'OVNHP';
    if (upper.includes('CAT')) return 'CAT';
    if (/\bYL\d*\b/.test(upper) || upper.includes('YELLOW LINE') || compactUpper.includes('YELLOWLINE')) return 'Yellow Line';
    if (/\bRL\d*\b/.test(upper) || upper.includes('RED LINE') || compactUpper.includes('REDLINE')) return 'Red Line';
    if (upper.includes('MHP')) return 'MHP';
    if (upper.includes('HP')) return 'HP';
    if (upper.includes('DD')) return 'DD';
    return cleanedName || colorName || 'Level';
  }

  function normalizeTradingViewPayloadRows(levels = []) {
    const prepared = (Array.isArray(levels) ? levels : []).map((level) => ({ ...level }));
    const consumedIndexes = new Set();
    const derivedZones = deriveDdBoundedZones(prepared, consumedIndexes);
    return prepared.filter((_level, index) => !consumedIndexes.has(index)).concat(derivedZones);
  }

  function deriveDdBoundedZones(levels, consumedIndexes) {
    const genericIndexes = levels
      .map((level, index) => [level, index])
      .filter(([level]) => isGenericZonePayloadRow(level, canonicalTradingViewKind(level.kind)))
      .map(([_level, index]) => index);
    const ddPrices = uniqueSortedPrices(levels
      .filter((level) => canonicalTradingViewKind(level.kind) === 'dd-band' || /\bDD\b/i.test(tradingViewField(level.name)))
      .map((level) => firstFinite(level.price))
      .filter((price) => price != null));
    if (!ddPrices.length) {
      genericIndexes.forEach((index) => consumedIndexes.add(index));
      return [];
    }

    const zones = [];
    let bullOrdinal = highestZoneOrdinal(levels, 'zone-bull') + 1;
    let bearOrdinal = highestZoneOrdinal(levels, 'zone-bear') + 1;
    levels.forEach((level, index) => {
      const kind = tradingViewLevelKind(level, level.name);
      if (!isGenericZonePayloadRow(level, kind)) return;
      consumedIndexes.add(index);
      const price = firstFinite(level.price);
      if (price == null) return;
      if (kind === 'zone-bull') {
        const top = lowestAbove(ddPrices, price);
        if (top == null || top <= price) return;
        zones.push(zoneBoundaryPayloadRow(level, `BZT${bullOrdinal}`, top, kind));
        zones.push(zoneBoundaryPayloadRow(level, `BZB${bullOrdinal}`, price, kind));
        bullOrdinal += 1;
      } else if (kind === 'zone-bear') {
        const bottom = highestBelow(ddPrices, price);
        if (bottom == null || price <= bottom) return;
        zones.push(zoneBoundaryPayloadRow(level, `BrZT${bearOrdinal}`, price, kind));
        zones.push(zoneBoundaryPayloadRow(level, `BrZB${bearOrdinal}`, bottom, kind));
        bearOrdinal += 1;
      }
    });
    return zones;
  }

  function uniqueSortedPrices(prices) {
    return Array.from(new Set(prices.map((price) => Number(price.toFixed(6))))).sort((a, b) => a - b);
  }

  function lowestAbove(prices, price) {
    return prices.find((candidate) => candidate > price) ?? null;
  }

  function highestBelow(prices, price) {
    for (let index = prices.length - 1; index >= 0; index -= 1) {
      if (prices[index] < price) return prices[index];
    }
    return null;
  }

  function zoneBoundaryPayloadRow(level, name, price, kind) {
    return { ...level, name: zoneBoundaryDisplayName(name, kind) || name, price, kind };
  }

  function highestZoneOrdinal(levels, kind) {
    let highest = 0;
    for (const level of levels) {
      if (canonicalTradingViewKind(level.kind) !== kind) continue;
      highest = Math.max(highest, zoneOrdinal(level.name, kind));
    }
    return highest;
  }

  function zoneOrdinal(name, kind) {
    const compact = tradingViewField(name).toUpperCase().replace(/[^A-Z0-9]+/g, '');
    const prefix = kind === 'zone-bear' ? 'BRZ' : 'BZ';
    const match = compact.match(new RegExp(`^${prefix}[TB](\\d*)$`));
    if (match) return match[1] ? Number(match[1]) : 1;
    const friendlyPrefix = kind === 'zone-bear' ? 'BEARZONE' : 'BULLZONE';
    const friendlyMatch = compact.match(new RegExp(`^${friendlyPrefix}(?:TOP|BOTTOM)(\\d*)$`));
    if (friendlyMatch) return friendlyMatch[1] ? Number(friendlyMatch[1]) : 1;
    return 0;
  }

  function isGenericZonePayloadRow(level = {}, kind = canonicalTradingViewKind(level.kind)) {
    if (kind !== 'zone-bull' && kind !== 'zone-bear') return false;
    const compact = tradingViewField(level.name).toUpperCase().replace(/[^A-Z0-9]+/g, '');
    return compact === 'BULLZONE' || compact === 'BEARZONE';
  }

  function isHalfGapName(value) {
    const compact = tradingViewField(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
    return compact === 'MIDGAP' || compact === 'HALFGAP' || compact === 'HG';
  }

  function tradingViewLevelKind(level = {}, name = '') {
    const explicit = canonicalTradingViewKind(level.kind);
    const byColor = manualLineKindFromColor(levelColor(level));
    const inferred = inferTradingViewKind(name);
    if (isZoneSideKind(inferred) && (explicit === '' || explicit === 'reference' || explicit === 'unknown' || explicit === 'zone' || isZoneSideKind(explicit))) return inferred;
    if (['yellow-line', 'red-line', 'cat'].includes(inferred) && ['', 'reference', 'unknown', 'open-close'].includes(explicit)) return inferred;
    if (['yellow-line', 'red-line', 'cat'].includes(byColor) && ['', 'reference', 'unknown', 'open-close'].includes(explicit)) return byColor;
    if (validTradingViewKind(explicit) && explicit !== 'unknown') return explicit;
    if (byColor && inferred === 'reference') return byColor;
    return inferred || byColor || explicit || 'reference';
  }

  function displayLineName(line = {}) {
    const rawName = tradingViewField(line.name);
    const explicitText = tradingViewField(line.label || line.text || line.title);
    const colorName = manualLineNameFromColor(levelColor(line));
    if (isDrawingObjectName(rawName)) return colorName || cleanTradingViewLevelName(explicitText || rawName);
    return cleanTradingViewLevelName(rawName || explicitText || colorName);
  }

  function cleanTradingViewLevelName(name) {
    return tradingViewField(String(name || '')
      .replace(/horizontal(?:[_\s-]*(?:line|ray)|line|ray)?/ig, ' ')
      .replace(/\btext\b/ig, ' ')
      .replace(/\bLiquidity\s*Map\b/ig, ' ')
      .replace(/\bliq-map-history\b/ig, ' ')
      .replace(/\s*:\s*/g, ' '));
  }

  function isDrawingObjectName(name) {
    return /^horizontal(?:[_\s-]*(?:line|ray)|line|ray)?$/i.test(tradingViewField(name));
  }

  function inferTradingViewKind(name) {
    const upper = String(name || '').toUpperCase();
    const compact = upper.replace(/[^A-Z0-9]+/g, '');
    if (upper.includes('BRZ') || upper.includes('BEAR')) return 'zone-bear';
    if (upper.includes('BZ') || upper.includes('BULL')) return 'zone-bull';
    if (upper.includes('CAT') || compact.includes('CAT')) return 'cat';
    if (/\bYL\d*\b/.test(upper) || upper.includes('YELLOW LINE') || compact.includes('YELLOWLINE')) return 'yellow-line';
    if (/\bRL\d*\b/.test(upper) || upper.includes('RED LINE') || compact.includes('REDLINE')) return 'red-line';
    if (upper.includes('MHP')) return 'mhp';
    if (upper.includes('HP')) return 'hp';
    if (upper.includes('DD')) return 'dd-band';
    if (upper.includes('OPEN') || upper.includes('CLOSE') || upper.includes('GAP')) return 'open-close';
    return 'reference';
  }

  function canonicalTradingViewKind(value) {
    const raw = tradingViewField(value).toLowerCase();
    const compact = raw.replace(/[\s_-]+/g, '');
    switch (compact) {
      case 'ddband':
        return 'dd-band';
      case 'openclose':
        return 'open-close';
      case 'yellowline':
        return 'yellow-line';
      case 'redline':
        return 'red-line';
      case 'catline':
        return 'cat';
      case 'zonebull':
      case 'bullzone':
        return 'zone-bull';
      case 'zonebear':
      case 'bearzone':
        return 'zone-bear';
      default:
        if (/^yl\d+$/.test(compact)) return 'yellow-line';
        if (/^rl\d+$/.test(compact)) return 'red-line';
        return raw;
    }
  }

  function validTradingViewKind(kind) {
    return [
      'dd-band',
      'hp',
      'mhp',
      'open-close',
      'reference',
      'yellow-line',
      'red-line',
      'cat',
      'zone-bull',
      'zone-bear',
      'stat',
      'unknown'
    ].includes(kind);
  }

  function isZoneSideKind(kind) {
    return kind === 'zone-bull' || kind === 'zone-bear';
  }

  function zoneBoundaryDisplayName(name, kind = '') {
    const compact = tradingViewField(name).toUpperCase().replace(/[^A-Z0-9]+/g, '');
    const suffix = zoneBoundaryOrdinalSuffix(compact);
    if (/^BRZT\d*$/.test(compact) || (kind === 'zone-bear' && (compact.includes('TOP') || compact.includes('UPPER')))) return `Bear Zone Top${suffix}`;
    if (/^BRZB\d*$/.test(compact) || (kind === 'zone-bear' && (compact.includes('BOTTOM') || compact.includes('LOWER')))) return `Bear Zone Bottom${suffix}`;
    if (/^BZT\d*$/.test(compact) || (kind === 'zone-bull' && (compact.includes('TOP') || compact.includes('UPPER')))) return `Bull Zone Top${suffix}`;
    if (/^BZB\d*$/.test(compact) || (kind === 'zone-bull' && (compact.includes('BOTTOM') || compact.includes('LOWER')))) return `Bull Zone Bottom${suffix}`;
    return '';
  }

  function zoneBoundaryOrdinalSuffix(compact) {
    const compactMatch = compact.match(/^(?:BRZ|BZ)[TB](\d+)$/);
    if (compactMatch && compactMatch[1]) return ` ${compactMatch[1]}`;
    const friendlyMatch = compact.match(/(?:TOP|BOTTOM|UPPER|LOWER)(\d+)$/);
    return friendlyMatch && friendlyMatch[1] ? ` ${friendlyMatch[1]}` : '';
  }

  function levelColor(level = {}) {
    return level.color || level.linecolor || level.lineColor || level.textcolor || level.textColor || level.backgroundColor || '';
  }

  function manualLineNameFromColor(color) {
    const rgb = colorRgb(color);
    if (!rgb) return '';
    if (isPurple(rgb)) return 'CAT';
    if (isYellow(rgb)) return 'Yellow Line';
    if (isRed(rgb)) return 'Red Line';
    return '';
  }

  function manualLineKindFromColor(color) {
    const name = manualLineNameFromColor(color);
    return name ? inferTradingViewKind(name) : '';
  }

  function colorRgb(value) {
    const raw = String(value || '').trim();
    const hex = raw.match(/^#?([0-9a-f]{6})$/i);
    if (hex) {
      const clean = hex[1];
      return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16)
      };
    }
    const rgb = raw.match(/rgba?\s*\(\s*([.\d]+)\s*,\s*([.\d]+)\s*,\s*([.\d]+)/i);
    if (rgb) {
      return {
        r: colorByte(rgb[1]),
        g: colorByte(rgb[2]),
        b: colorByte(rgb[3])
      };
    }
    const named = raw.toLowerCase();
    if (named === 'yellow') return { r: 255, g: 235, b: 59 };
    if (named === 'red') return { r: 242, g: 54, b: 69 };
    if (named === 'purple') return { r: 126, g: 87, b: 194 };
    return null;
  }

  function colorByte(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(255, Math.round(number))) : 0;
  }

  function isYellow({ r, g, b }) {
    return r >= 220 && g >= 190 && b <= 140;
  }

  function isRed({ r, g, b }) {
    return r >= 200 && g <= 110 && b <= 130;
  }

  function isPurple({ r, g, b }) {
    return b >= 140 && r >= 80 && r > g && b > r;
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
    hasAnyDisplayData,
    selectedSymbolIssue,
    summaryHasDisplayData,
    symbolLevelCount,
    cleanTradingViewPayload,
    captureToTradingViewSnapshot,
    tradingViewPayloadFromSnapshot,
    tradingViewBundleCopyIssue,
    tradingViewCopyIssue
  };
})();

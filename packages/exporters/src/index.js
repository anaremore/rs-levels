import { displaySymbolFor, normalizeSymbolSnapshot } from '../../schemas/src/index.js';

export function createTradingViewPayloadExport(symbolSnapshot, options = {}) {
  const row = normalizeRow(symbolSnapshot, options);
  const levels = limitLevels(prepareDisplayLevels(row.levels), options.maxLevels).filter((level) => Number.isFinite(level.price));
  const statRows = tradingViewStatsRows(statsWithDerivedRiskInterval(row.stats, levels));
  return tradingViewPayload([{
    symbol: displaySymbolFor(row.symbol),
    capturedAt: row.capturedAt,
    levels: [...levels, ...statRows]
  }], options);
}

export function createTradingViewBundlePayloadExport(snapshot, options = {}) {
  const rows = bundleRows(snapshot, options);
  return tradingViewPayload(rows.map((row) => {
    const levels = limitLevels(prepareDisplayLevels(row.levels), options.maxLevels).filter((level) => Number.isFinite(level.price));
    return {
      symbol: displaySymbolFor(row.symbol),
      capturedAt: row.capturedAt,
      levels: [
        ...levels,
        ...tradingViewStatsRows(statsWithDerivedRiskInterval(row.stats, levels))
      ]
    };
  }), {
    ...options,
    generatedAt: options.generatedAt || snapshot?.generatedAt
  });
}

function normalizeRow(symbolSnapshot, options) {
  return normalizeSymbolSnapshot(options.symbol || symbolSnapshot?.symbol, symbolSnapshot || {});
}

function bundleRows(snapshot, options) {
  const symbols = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot.symbols : {};
  const rowOptions = { ...options };
  delete rowOptions.symbol;
  return Object.values(symbols || {})
    .map((row) => normalizeRow(row, rowOptions))
    .filter((row) => isTradingViewBundleSymbol(row.symbol) && hasTradingViewRows(row))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function isTradingViewBundleSymbol(symbol) {
  return symbol === 'MES' || symbol === 'MNQ';
}

function tradingViewPayload(rows, options = {}) {
  const generatedAt = field(options.generatedAt || new Date().toISOString());
  const sections = rows
    .filter((row) => row.symbol && Array.isArray(row.levels) && row.levels.length)
    .flatMap((row) => {
      const levelText = row.levels.map(tradingViewLevelRow).filter(Boolean).join(';');
      return levelText ? [field(row.symbol), field(row.capturedAt), levelText] : [];
    });
  return ['RSLEVELS', '2', generatedAt, ...sections].join('|');
}

function tradingViewLevelRow(level) {
  const name = tradingViewLevelName(level);
  const price = tradingViewPrice(level?.price);
  const kind = tradingViewLevelKind(level, name);
  return name && price && kind ? `${name},${price},${kind}` : '';
}

export function prepareDisplayLevels(levels = []) {
  if (!Array.isArray(levels)) return [];
  const prepared = levels.map((level) => ({ ...level }));
  const consumedIndexes = new Set();
  const derivedZones = deriveDdBoundedZones(prepared, consumedIndexes);
  return prepared.filter((_level, index) => !consumedIndexes.has(index)).concat(derivedZones);
}

function deriveDdBoundedZones(levels, consumedIndexes) {
  const genericIndexes = levels
    .map((level, index) => [level, index])
    .filter(([level]) => isGenericZoneLevel(level, canonicalTradingViewKind(level?.kind)))
    .map(([_level, index]) => index);
  const ddPrices = uniqueSortedPrices(levels
    .filter((level) => canonicalTradingViewKind(level?.kind) === 'dd-band' || /\bDD\b/i.test(field(level?.name)))
    .map((level) => finiteNumber(level?.price))
    .filter((price) => price != null));
  if (!ddPrices.length) {
    genericIndexes.forEach((index) => consumedIndexes.add(index));
    return [];
  }

  const zones = [];
  let bullOrdinal = highestZoneOrdinal(levels, 'zone-bull') + 1;
  let bearOrdinal = highestZoneOrdinal(levels, 'zone-bear') + 1;
  levels.forEach((level, index) => {
    const kind = tradingViewLevelKind(level, level?.name);
    if (!isGenericZoneLevel(level, kind)) return;
    consumedIndexes.add(index);
    const price = finiteNumber(level?.price);
    if (price == null) return;
    if (kind === 'zone-bull') {
      const top = lowestAbove(ddPrices, price);
      if (top == null || top <= price) return;
      zones.push(zoneBoundaryLevel(level, `BZT${bullOrdinal}`, top, kind));
      zones.push(zoneBoundaryLevel(level, `BZB${bullOrdinal}`, price, kind));
      bullOrdinal += 1;
    } else if (kind === 'zone-bear') {
      const bottom = highestBelow(ddPrices, price);
      if (bottom == null || price <= bottom) return;
      zones.push(zoneBoundaryLevel(level, `BrZT${bearOrdinal}`, price, kind));
      zones.push(zoneBoundaryLevel(level, `BrZB${bearOrdinal}`, bottom, kind));
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

function zoneBoundaryLevel(level, name, price, kind) {
  const { id, ...rest } = level;
  return { ...rest, name, price, kind };
}

function highestZoneOrdinal(levels, kind) {
  let highest = 0;
  for (const level of levels) {
    if (canonicalTradingViewKind(level?.kind) !== kind) continue;
    const ordinal = zoneOrdinal(level?.name, kind);
    highest = Math.max(highest, ordinal);
  }
  return highest;
}

function zoneOrdinal(name, kind) {
  const compact = field(name).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const prefix = kind === 'zone-bear' ? 'BRZ' : 'BZ';
  const match = compact.match(new RegExp(`^${prefix}[TB](\\d*)$`));
  if (!match) return 0;
  return match[1] ? Number(match[1]) : 1;
}

function isGenericZoneLevel(level, kind = canonicalTradingViewKind(level?.kind)) {
  if (kind !== 'zone-bull' && kind !== 'zone-bear') return false;
  const compact = field(level?.name).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return compact === 'BULLZONE' || compact === 'BEARZONE';
}

function hasTradingViewRows(row) {
  return (Array.isArray(row.levels) && row.levels.some((level) => Number.isFinite(level.price))) ||
    tradingViewStatsRows(row.stats).length > 0;
}

function statsWithDerivedRiskInterval(stats = {}, levels = []) {
  const riskInterval = finiteNumber(stats.riskInterval);
  if (riskInterval != null) return stats;
  const derived = riskIntervalFromDdBands(levels);
  return derived == null ? stats : { ...stats, riskInterval: derived };
}

function riskIntervalFromDdBands(levels = []) {
  if (!Array.isArray(levels)) return null;
  const prices = Array.from(new Set(levels
    .filter((level) => canonicalTradingViewKind(level?.kind) === 'dd-band' || /\bDD\b/i.test(field(level?.name)))
    .map((level) => finiteNumber(level?.price))
    .filter((price) => price != null)
    .map((price) => Number(price.toFixed(6)))))
    .sort((a, b) => a - b);
  if (prices.length < 2) return null;
  const derived = (prices[prices.length - 1] - prices[0]) / 2;
  return derived > 0 ? Number(derived.toFixed(6)) : null;
}

function tradingViewStatsRows(stats = {}) {
  const rows = [];
  const dd = finiteNumber(stats.dd);
  const riskInterval = finiteNumber(stats.riskInterval);
  const resilience = finiteNumber(stats.resilience);
  const monthlyResilience = finiteNumber(stats.monthlyResilience);
  const weeklyResilience = finiteNumber(stats.weeklyResilience);
  const mapCode = field(stats.mapCode);
  if (dd != null) rows.push({ name: 'DD', price: dd, kind: 'stat' });
  if (riskInterval != null) rows.push({ name: 'RI', price: riskInterval, kind: 'stat' });
  if (resilience != null) rows.push({ name: 'Res', price: resilience, kind: 'stat' });
  if (monthlyResilience != null) rows.push({ name: 'MRes', price: monthlyResilience, kind: 'stat' });
  if (weeklyResilience != null) rows.push({ name: 'WRes', price: weeklyResilience, kind: 'stat' });
  if (mapCode) rows.push({ name: `Map ${mapCode}`, price: 0, kind: 'stat' });
  return rows;
}

function tradingViewLevelName(level) {
  const raw = field(level?.name);
  if (!raw) return 'Level';
  const kind = canonicalTradingViewKind(level?.kind);
  const zoneName = zoneBoundaryDisplayName(raw, kind);
  if (zoneName) return zoneName;
  if (kind === 'red-line') return 'Red Line';
  if (kind === 'yellow-line') return 'Yellow Line';
  if (kind === 'cat') return 'CAT';
  if (isHalfGapName(raw)) return 'Half Gap';
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  if (/^RL\d*$/.test(compact) || compact.includes('REDLINE')) return 'Red Line';
  if (/^YL\d*$/.test(compact) || compact.includes('YELLOWLINE')) return 'Yellow Line';
  if (!/horizontal|liquidity\s*map|\btext\b|liq-map-history/i.test(raw)) return raw;
  const upper = raw.toUpperCase();
  const displayMatch = raw.match(/\b(BrZT\d*|BrZB\d*|BZT\d*|BZB\d*|OVNMHP|OVNHP|PrevDayClose|LastOpen|MidGap|HalfGap|HG|man_MHP|man_HP)\b/i);
  if (displayMatch) return normalizedDisplayMatch(displayMatch[1]);
  if (/\bOPEN\b/.test(upper) && !/\bCLOSE\b/.test(upper)) return 'Open';
  if (/\bCLOSE\b/.test(upper)) return 'Close';
  if (/\bMHP\b/.test(upper)) return 'MHP';
  if (/\bHP\b/.test(upper)) return 'HP';
  if (/\bDD\b/.test(upper)) return 'DD';
  return field(raw
    .replace(/horizontal(?:[_\s-]*(?:line|ray)|line|ray)?/ig, ' ')
    .replace(/\btext\b/ig, ' ')
    .replace(/\bLiquidity\s*Map\b/ig, ' ')
    .replace(/\bliq-map-history\b/ig, ' ')
    .replace(/\s*:\s*/g, ' ')) || 'Level';
}

function tradingViewLevelKind(level, name) {
  const explicit = canonicalTradingViewKind(level?.kind);
  const inferred = inferManualKind(name || level?.name);
  const byColor = manualKindFromColor(level?.color);
  if (isZoneSideKind(inferred) && (explicit === '' || explicit === 'reference' || explicit === 'unknown' || explicit === 'zone' || isZoneSideKind(explicit))) return inferred;
  if (['yellow-line', 'red-line', 'cat'].includes(inferred) && ['', 'reference', 'unknown', 'open-close'].includes(explicit)) return inferred;
  if (['yellow-line', 'red-line', 'cat'].includes(byColor) && ['', 'reference', 'unknown', 'open-close'].includes(explicit)) return byColor;
  if (explicit && explicit !== 'unknown') return explicit;
  return inferred || byColor || explicit || 'reference';
}

function canonicalTradingViewKind(value) {
  const raw = field(value).toLowerCase();
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

function inferManualKind(name) {
  const upper = field(name).toUpperCase();
  const compact = upper.replace(/[^A-Z0-9]+/g, '');
  if (upper.includes('BRZ') || upper.includes('BEAR')) return 'zone-bear';
  if (upper.includes('BZ') || upper.includes('BULL')) return 'zone-bull';
  if (upper.includes('CAT') || compact.includes('CAT')) return 'cat';
  if (/\bYL\d*\b/.test(upper) || upper.includes('YELLOW LINE') || compact.includes('YELLOWLINE')) return 'yellow-line';
  if (/\bRL\d*\b/.test(upper) || upper.includes('RED LINE') || compact.includes('REDLINE')) return 'red-line';
  return '';
}

function isZoneSideKind(kind) {
  return kind === 'zone-bull' || kind === 'zone-bear';
}

function zoneBoundaryDisplayName(name, kind = '') {
  const compact = field(name).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  if (/^BRZT\d*$/.test(compact) || (kind === 'zone-bear' && (compact.includes('TOP') || compact.includes('UPPER')))) return 'Bear Zone Top';
  if (/^BRZB\d*$/.test(compact) || (kind === 'zone-bear' && (compact.includes('BOTTOM') || compact.includes('LOWER')))) return 'Bear Zone Bottom';
  if (/^BZT\d*$/.test(compact) || (kind === 'zone-bull' && (compact.includes('TOP') || compact.includes('UPPER')))) return 'Bull Zone Top';
  if (/^BZB\d*$/.test(compact) || (kind === 'zone-bull' && (compact.includes('BOTTOM') || compact.includes('LOWER')))) return 'Bull Zone Bottom';
  return '';
}

function manualKindFromColor(color) {
  const rgb = colorRgb(color);
  if (!rgb) return '';
  if (isPurple(rgb)) return 'cat';
  if (isYellow(rgb)) return 'yellow-line';
  if (isRed(rgb)) return 'red-line';
  return '';
}

function normalizedDisplayMatch(matchText) {
  const text = field(matchText);
  if (/^man_mhp$/i.test(text)) return 'MHP';
  if (/^man_hp$/i.test(text)) return 'HP';
  if (isHalfGapName(text)) return 'Half Gap';
  if (/^lastopen$/i.test(text)) return 'Open';
  if (/^prevdayclose$/i.test(text)) return 'Prev Close';
  return text;
}

function isHalfGapName(value) {
  const compact = field(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return compact === 'MIDGAP' || compact === 'HALFGAP' || compact === 'HG';
}

function field(value) {
  return String(value ?? '')
    .replace(/[|;,"\[\]\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tradingViewPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '';
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function colorRgb(value) {
  const raw = field(value);
  const hex = raw.match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    const clean = hex[1];
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }
  return null;
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

function limitLevels(levels, maxLevels) {
  if (!Array.isArray(levels)) return [];
  const limit = optionalPositiveInteger(maxLevels);
  return limit == null ? levels : levels.slice(0, limit);
}

function optionalPositiveInteger(value) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return null;
  return number;
}

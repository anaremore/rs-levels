import { displaySymbolFor, normalizeSymbolSnapshot } from '../../schemas/src/index.js';

export function createTradingViewPayloadExport(symbolSnapshot, options = {}) {
  const row = normalizeRow(symbolSnapshot, options);
  const levels = limitLevels(row.levels, options.maxLevels).filter((level) => Number.isFinite(level.price));
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
    const levels = limitLevels(row.levels, options.maxLevels).filter((level) => Number.isFinite(level.price));
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
  if (kind === 'red-line') return 'Red Line';
  if (kind === 'yellow-line') return 'Yellow Line';
  if (kind === 'cat') return 'CAT';
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
  if (explicit && explicit !== 'unknown') return explicit;
  const inferred = inferManualKind(name || level?.name);
  const byColor = manualKindFromColor(level?.color);
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
      return raw;
  }
}

function inferManualKind(name) {
  const upper = field(name).toUpperCase();
  const compact = upper.replace(/[^A-Z0-9]+/g, '');
  if (upper.includes('CAT') || compact.includes('CAT')) return 'cat';
  if (/\bYL\b/.test(upper) || upper.includes('YELLOW LINE') || compact.includes('YELLOWLINE')) return 'yellow-line';
  if (/\bRL\b/.test(upper) || upper.includes('RED LINE') || compact.includes('REDLINE')) return 'red-line';
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
  if (/^midgap$/i.test(text) || /^halfgap$/i.test(text) || /^hg$/i.test(text)) return 'Mid Gap';
  if (/^lastopen$/i.test(text)) return 'Open';
  if (/^prevdayclose$/i.test(text)) return 'Prev Close';
  return text;
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

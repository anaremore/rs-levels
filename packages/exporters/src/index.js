import { displaySymbolFor, normalizeSymbolSnapshot } from '../../schemas/src/index.js';

export function createTradingViewPayloadExport(symbolSnapshot, options = {}) {
  const row = normalizeRow(symbolSnapshot, options);
  const levels = limitLevels(row.levels, options.maxLevels).filter((level) => Number.isFinite(level.price));
  return tradingViewPayload([{
    symbol: displaySymbolFor(row.symbol),
    capturedAt: row.capturedAt,
    levels
  }], options);
}

export function createTradingViewBundlePayloadExport(snapshot, options = {}) {
  const rows = bundleRows(snapshot, options);
  return tradingViewPayload(rows.map((row) => ({
    symbol: displaySymbolFor(row.symbol),
    capturedAt: row.capturedAt,
    levels: limitLevels(row.levels, options.maxLevels).filter((level) => Number.isFinite(level.price))
  })), {
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
    .filter((row) => isTradingViewBundleSymbol(row.symbol) && Array.isArray(row.levels) && row.levels.some((level) => Number.isFinite(level.price)))
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
  const kind = field(level?.kind);
  return name && price && kind ? `${name},${price},${kind}` : '';
}

function tradingViewLevelName(level) {
  const raw = field(level?.name);
  if (!raw) return 'Level';
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
    .replace(/horizontal[_\s-]*(line|ray)?/ig, ' ')
    .replace(/\btext\b/ig, ' ')
    .replace(/\bLiquidity\s*Map\b/ig, ' ')
    .replace(/\bliq-map-history\b/ig, ' ')
    .replace(/\s*:\s*/g, ' ')) || 'Level';
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

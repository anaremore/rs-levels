import { SCHEMA_VERSION, normalizeSymbolSnapshot } from '../../schemas/src/index.js';

export const TRADINGVIEW_PAYLOAD_PREFIX = 'RSLEVELS';

export function createTradingViewPayload(symbolSnapshot, options = {}) {
  const row = normalizeRow(symbolSnapshot, options);

  return [
    TRADINGVIEW_PAYLOAD_PREFIX,
    '1',
    field(row.symbol),
    field(row.capturedAt || options.capturedAt || ''),
    levelsPayload(row.levels, options)
  ].join('|');
}

export function createTradingViewBundlePayload(snapshot, options = {}) {
  const rows = bundleRows(snapshot, options);
  return [
    TRADINGVIEW_PAYLOAD_PREFIX,
    '2',
    field(options.generatedAt || snapshot?.generatedAt || latestCapturedAt(rows) || ''),
    ...rows.flatMap((row) => [
      field(row.symbol),
      field(row.capturedAt || options.capturedAt || ''),
      levelsPayload(row.levels, options)
    ])
  ].join('|');
}

export function createTradingViewJsonExport(symbolSnapshot, options = {}) {
  const row = normalizeRow(symbolSnapshot, options);
  const levels = limitLevels(row.levels, options.maxLevels).filter((level) => Number.isFinite(level.price));
  return {
    schemaVersion: SCHEMA_VERSION,
    exportFormat: 'tradingview-json',
    payloadVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    symbol: row.symbol,
    capturedAt: row.capturedAt,
    compactPayload: createTradingViewPayload(row, options),
    levels: levels.map((level) => ({
      name: tradingViewLevelName(level),
      price: level.price,
      kind: level.kind,
      color: level.color || ''
    })),
    notes: [
      'TradingView Pine scripts cannot poll the local API directly.',
      'Use the compact RSLEVELS payload for the included Pine indicator input.'
    ]
  };
}

export function createTradingViewBundleJsonExport(snapshot, options = {}) {
  const rows = bundleRows(snapshot, options);
  return {
    schemaVersion: SCHEMA_VERSION,
    exportFormat: 'tradingview-bundle-json',
    payloadVersion: 2,
    generatedAt: options.generatedAt || snapshot?.generatedAt || new Date().toISOString(),
    compactPayload: createTradingViewBundlePayload(snapshot, options),
    symbols: rows.map((row) => {
      const levels = limitLevels(row.levels, options.maxLevels).filter((level) => Number.isFinite(level.price));
      return {
        symbol: row.symbol,
        capturedAt: row.capturedAt,
        levelCount: levels.length,
        levels: levels.map((level) => ({
          name: tradingViewLevelName(level),
          price: level.price,
          kind: level.kind,
          color: level.color || ''
        }))
      };
    }),
    notes: [
      'TradingView Pine scripts cannot poll the local API directly.',
      'Use the compact RSLEVELS v2 payload for the included Pine indicator input.'
    ]
  };
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

function levelsPayload(levels, options) {
  return limitLevels(levels, options.maxLevels)
    .filter((level) => Number.isFinite(level.price))
    .map((level) => [field(tradingViewLevelName(level)), Number(level.price).toFixed(2), field(level.kind)].join(','))
    .join(';');
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

function latestCapturedAt(rows) {
  return rows.map((row) => row.capturedAt || '').filter(Boolean).sort().at(-1) || '';
}

function field(value) {
  return String(value ?? '')
    .replace(/[|;,\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

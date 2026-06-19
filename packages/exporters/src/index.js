import { SCHEMA_VERSION, normalizeSymbolSnapshot } from '../../schemas/src/index.js';

export const TRADINGVIEW_PAYLOAD_PREFIX = 'RSLEVELS';
const DEFAULT_MAX_LEVELS = 40;

export function createTradingViewPayload(symbolSnapshot, options = {}) {
  const row = normalizeRow(symbolSnapshot, options);
  const maxLevels = boundedInteger(options.maxLevels, 1, 100, DEFAULT_MAX_LEVELS);
  const levels = row.levels
    .filter((level) => Number.isFinite(level.price))
    .slice(0, maxLevels)
    .map((level) => [field(level.name), Number(level.price).toFixed(2), field(level.kind)].join(','))
    .join(';');

  return [
    TRADINGVIEW_PAYLOAD_PREFIX,
    '1',
    field(row.symbol),
    field(row.capturedAt || options.capturedAt || ''),
    levels
  ].join('|');
}

export function createTradingViewJsonExport(symbolSnapshot, options = {}) {
  const row = normalizeRow(symbolSnapshot, options);
  const maxLevels = boundedInteger(options.maxLevels, 1, 250, 100);
  return {
    schemaVersion: SCHEMA_VERSION,
    exportFormat: 'tradingview-json',
    generatedAt: options.generatedAt || new Date().toISOString(),
    symbol: row.symbol,
    capturedAt: row.capturedAt,
    levels: row.levels
      .filter((level) => Number.isFinite(level.price))
      .slice(0, maxLevels)
      .map((level) => ({
        name: level.name,
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

function normalizeRow(symbolSnapshot, options) {
  return normalizeSymbolSnapshot(options.symbol || symbolSnapshot?.symbol, symbolSnapshot || {});
}

function field(value) {
  return String(value ?? '')
    .replace(/[|;,\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
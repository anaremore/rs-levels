import { SCHEMA_VERSION, normalizeSymbolSnapshot } from '../../schemas/src/index.js';

export const TRADINGVIEW_PAYLOAD_PREFIX = 'RSLEVELS';

export function createTradingViewPayload(symbolSnapshot, options = {}) {
  const row = normalizeRow(symbolSnapshot, options);
  const levels = limitLevels(row.levels, options.maxLevels)
    .filter((level) => Number.isFinite(level.price))
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

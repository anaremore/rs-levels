export const SCHEMA_VERSION = '0.1.0';

export const LEVEL_KINDS = Object.freeze([
  'hp',
  'mhp',
  'zone',
  'zone-bull',
  'zone-bear',
  'dd-band',
  'reference',
  'open-close',
  'stat',
  'unknown'
]);

export const SOURCE_STATES = Object.freeze([
  'offline',
  'waiting',
  'capturing',
  'stale',
  'error'
]);

export function createEmptySnapshot(options = {}) {
  const generatedAt = isoTimestamp(options.generatedAt);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    capturedAt: options.capturedAt || '',
    source: normalizeSourceState(options.source || {}),
    symbols: {},
    warnings: normalizeWarnings(options.warnings || [])
  };
}

export function normalizeSourceState(source = {}) {
  const state = SOURCE_STATES.includes(source.state) ? source.state : 'waiting';
  return {
    state,
    connected: Boolean(source.connected),
    lastCaptureAt: typeof source.lastCaptureAt === 'string' ? source.lastCaptureAt : '',
    ageMs: finiteNumberOrNull(source.ageMs),
    endpoints: Array.isArray(source.endpoints) ? source.endpoints.map(normalizeEndpointSummary) : [],
    warnings: normalizeWarnings(source.warnings || [])
  };
}

export function normalizeEndpointSummary(endpoint = {}) {
  return {
    key: stringValue(endpoint.key),
    status: integerOrNull(endpoint.status),
    capturedAt: stringValue(endpoint.capturedAt),
    parser: stringValue(endpoint.parser),
    ok: endpoint.ok !== false
  };
}

export function normalizeSymbolSnapshot(symbol, input = {}) {
  const cleanSymbol = normalizeSymbol(symbol || input.symbol);
  return {
    symbol: cleanSymbol,
    displaySymbol: stringValue(input.displaySymbol || cleanSymbol),
    price: finiteNumberOrNull(input.price),
    capturedAt: stringValue(input.capturedAt),
    levels: Array.isArray(input.levels) ? input.levels.map((level) => normalizeLevel(cleanSymbol, level)) : [],
    stats: normalizeStats(input.stats || {}),
    warnings: normalizeWarnings(input.warnings || [])
  };
}

export function normalizeLevel(symbol, level = {}) {
  const kind = LEVEL_KINDS.includes(level.kind) ? level.kind : inferLevelKind(level.name);
  return {
    id: stringValue(level.id || level.key || stableLevelId(symbol, level)),
    symbol: normalizeSymbol(level.symbol || symbol),
    name: stringValue(level.name || 'Level'),
    price: finiteNumberOrNull(level.price),
    kind,
    color: normalizeColor(level.color),
    source: stringValue(level.source || 'rocketscooter'),
    capturedAt: stringValue(level.capturedAt),
    metadata: plainObject(level.metadata) ? level.metadata : {}
  };
}

export function normalizeStats(stats = {}) {
  return {
    dd: finiteNumberOrNull(stats.dd),
    resilience: finiteNumberOrNull(stats.resilience),
    weeklyResilience: finiteNumberOrNull(stats.weeklyResilience),
    monthlyResilience: finiteNumberOrNull(stats.monthlyResilience),
    mapCode: stringValue(stats.mapCode)
  };
}

export function validateSnapshot(snapshot) {
  const errors = [];
  if (!plainObject(snapshot)) {
    return { ok: false, errors: ['snapshot must be an object'] };
  }
  if (snapshot.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!isIsoLike(snapshot.generatedAt)) {
    errors.push('generatedAt must be an ISO timestamp string');
  }
  if (!plainObject(snapshot.source)) {
    errors.push('source must be an object');
  }
  if (!plainObject(snapshot.symbols)) {
    errors.push('symbols must be an object keyed by display symbol');
  } else {
    Object.keys(snapshot.symbols).forEach((symbol) => {
      validateSymbolSnapshot(symbol, snapshot.symbols[symbol]).forEach((error) => errors.push(error));
    });
  }
  if (!Array.isArray(snapshot.warnings)) {
    errors.push('warnings must be an array');
  }
  return { ok: errors.length === 0, errors };
}

export function validateSymbolSnapshot(symbol, snapshot) {
  const errors = [];
  if (!plainObject(snapshot)) {
    return [`symbols.${symbol} must be an object`];
  }
  if (normalizeSymbol(snapshot.symbol) !== normalizeSymbol(symbol)) {
    errors.push(`symbols.${symbol}.symbol must match its key`);
  }
  if (!Array.isArray(snapshot.levels)) {
    errors.push(`symbols.${symbol}.levels must be an array`);
  } else {
    snapshot.levels.forEach((level, index) => {
      validateLevel(level).forEach((error) => errors.push(`symbols.${symbol}.levels[${index}].${error}`));
    });
  }
  if (!plainObject(snapshot.stats)) {
    errors.push(`symbols.${symbol}.stats must be an object`);
  }
  return errors;
}

export function validateLevel(level) {
  const errors = [];
  if (!plainObject(level)) return ['must be an object'];
  if (!level.id) errors.push('id is required');
  if (!level.symbol) errors.push('symbol is required');
  if (!level.name) errors.push('name is required');
  if (typeof level.price !== 'number' || !Number.isFinite(level.price)) errors.push('price must be a finite number');
  if (!LEVEL_KINDS.includes(level.kind)) errors.push(`kind must be one of ${LEVEL_KINDS.join(', ')}`);
  return errors;
}

export function normalizeSymbol(value) {
  const text = stringValue(value).toUpperCase();
  if (!text) return 'MES';
  if (isNqFamilySymbol(text)) return 'MNQ';
  if (isEsFamilySymbol(text)) return 'MES';
  return text;
}

function isNqFamilySymbol(text) {
  const parts = symbolParts(text);
  return parts.some((part) => (
    part === 'MNQ' ||
    part === 'NQ' ||
    part === 'ENQ' ||
    /^M?NQ[FGHJKMNQUVXZ]\d{1,2}$/.test(part) ||
    /^ENQ[FGHJKMNQUVXZ]\d{1,2}$/.test(part)
  )) || /\bNASDAQ\b/.test(text) || /\bNQ[-\s]?100\b/.test(text);
}

function isEsFamilySymbol(text) {
  const parts = symbolParts(text);
  return parts.some((part) => (
    part === 'MES' ||
    part === 'ES' ||
    part === 'EP' ||
    /^M?ES[FGHJKMNQUVXZ]\d{1,2}$/.test(part) ||
    /^EP[FGHJKMNQUVXZ]\d{1,2}$/.test(part)
  )) || /\bS\s*&\s*P\s*500\b/.test(text) || /\bS\s+AND\s+P\s+500\b/.test(text) || /\bSPX?\s*500\b/.test(text);
}

function symbolParts(text) {
  return stringValue(text).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

export function inferLevelKind(name) {
  const text = stringValue(name).toUpperCase();
  if (text.includes('MHP')) return 'mhp';
  if (text.includes('HP')) return 'hp';
  if (text.includes('DD')) return 'dd-band';
  if (text.includes('BRZ') || text.includes('BEAR')) return 'zone-bear';
  if (text.includes('BZ') || text.includes('BULL')) return 'zone-bull';
  if (text.includes('ZONE')) return 'zone';
  if (text.includes('OPEN') || text.includes('CLOSE') || text.includes('HIGH') || text.includes('GAP')) return 'open-close';
  if (text === 'DD' || text.includes('RES')) return 'stat';
  if (text.includes('YL') || text.includes('RL')) return 'reference';
  return 'unknown';
}

export function stableLevelId(symbol, level = {}) {
  const cleanSymbol = normalizeSymbol(symbol || level.symbol);
  const cleanName = stringValue(level.name || 'Level').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const price = finiteNumberOrNull(level.price);
  return [cleanSymbol, cleanName || 'LEVEL', price == null ? 'NA' : price.toFixed(2)].join(':');
}

function normalizeWarnings(warnings) {
  return Array.isArray(warnings) ? warnings.map(stringValue).filter(Boolean).slice(0, 50) : [];
}

function normalizeColor(value) {
  const text = stringValue(value);
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase();
  return '';
}

function isoTimestamp(value) {
  if (typeof value === 'string' && isIsoLike(value)) return value;
  const date = value instanceof Date ? value : new Date();
  return date.toISOString();
}

function isIsoLike(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function integerOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

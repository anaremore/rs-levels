import {
  inferLevelKind,
  normalizeEndpointSummary,
  normalizeLevel,
  normalizeSymbol,
  stableLevelId
} from '../../schemas/src/index.js';

const MAX_DEPTH = 8;
const MAX_LEVELS_PER_CAPTURE = 200;

const NAME_KEYS = ['name', 'label', 'text', 'title', 'caption', 'displayName', 'level', 'levelName', 'pivotName'];
const PRICE_KEYS = ['price', 'value', 'val', 'target', 'last', 'y', 'p', 'levelPrice', 'levelValue', 'pivotPrice'];
const SYMBOL_KEYS = ['symbol', 'ticker', 'root', 'instrument'];

export function normalizeCapture(capture = {}) {
  const capturedAt = stringValue(capture.capturedAt) || new Date().toISOString();
  const endpoint = normalizeEndpointSummary({
    key: endpointKey(capture),
    url: stringValue(capture.url || capture.endpoint || capture.path),
    status: integerOrNull(capture.status),
    capturedAt,
    parser: 'generic-display-levels',
    ok: true
  });

  const warnings = [];
  const parsed = parseBody(capture.body, warnings);
  const symbolHint = detectSymbol(capture, parsed);
  const levels = collectLevels(parsed, {
    symbolHint,
    capturedAt,
    endpointKey: endpoint.key,
    source: 'rocketscooter',
    warnings
  });

  if (!levels.length) {
    warnings.push('No display levels were recognized in this capture.');
  }

  return {
    endpoint,
    capturedAt,
    symbols: groupLevelsBySymbol(levels),
    warnings
  };
}

export function parseBody(body, warnings = []) {
  if (body == null || body === '') return null;
  if (typeof body === 'object') return body;
  if (typeof body !== 'string') return null;
  try {
    return JSON.parse(body);
  } catch (err) {
    warnings.push('Capture body was not JSON.');
    return null;
  }
}

export function collectLevels(root, options = {}) {
  const levels = [];
  const seen = new Set();
  walk(root, 0, (node) => {
    if (!node || typeof node !== 'object') return;
    const candidates = Array.isArray(node) ? [candidateFromArray(node, options)] : [
      candidateFromObject(node, options),
      ...candidatesFromNamedPriceMap(node, options)
    ];
    candidates.filter(Boolean).forEach((candidate) => {
      const id = candidate.id || stableLevelId(candidate.symbol, candidate);
      if (seen.has(id)) return;
      seen.add(id);
      levels.push({ ...candidate, id });
    });
  });
  return levels.slice(0, MAX_LEVELS_PER_CAPTURE);
}

export function endpointKey(capture = {}) {
  const raw = stringValue(capture.endpoint || capture.path || capture.url || 'capture');
  return scrubEndpointKey(raw.replace(/^https?:\/\/[^/]+/i, '').split('?')[0] || 'capture');
}

function candidateFromObject(node, options) {
  const name = firstString(node, NAME_KEYS);
  const price = firstNumber(node, PRICE_KEYS);
  if (!name || price == null) return null;
  if (!looksLikeDisplayLevelName(name)) return null;
  const symbol = normalizeSymbol(firstString(node, SYMBOL_KEYS) || options.symbolHint || '');
  return normalizeLevel(symbol, {
    id: stringValue(node.id || node.key),
    symbol,
    name,
    price,
    kind: stringValue(node.kind) || inferLevelKind(name),
    color: normalizeInputColor(node.color || node.colour || node.rgb),
    source: options.source || 'rocketscooter',
    capturedAt: options.capturedAt || '',
    metadata: withEndpointMetadata(displayMetadata(node), options.endpointKey)
  });
}

function candidateFromArray(row, options) {
  if (!Array.isArray(row) || row.length < 2 || row.length > 12) return null;
  const nameIndex = row.findIndex((item) => typeof item === 'string' && looksLikeDisplayLevelName(item));
  if (nameIndex < 0) return null;
  const name = stringValue(row[nameIndex]);
  const priceInfo = firstArrayNumber(row, nameIndex);
  if (!priceInfo) return null;
  const symbol = normalizeSymbol(options.symbolHint || '');
  return normalizeLevel(symbol, {
    symbol,
    name,
    price: priceInfo.value,
    kind: explicitKind(row) || inferLevelKind(name),
    color: colorFromArray(row, nameIndex, priceInfo.index),
    source: options.source || 'rocketscooter',
    capturedAt: options.capturedAt || '',
    metadata: withEndpointMetadata({}, options.endpointKey)
  });
}

function candidatesFromNamedPriceMap(node, options) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
  const candidates = [];
  for (const [rawName, rawValue] of Object.entries(node)) {
    const name = stringValue(rawName);
    if (!looksLikeDisplayLevelName(name)) continue;
    const candidate = candidateFromNamedValue(name, rawValue, options);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

function candidateFromNamedValue(name, value, options) {
  let price = numberValue(value);
  let color = '';
  let kind = inferLevelKind(name);
  let id = '';
  let symbol = normalizeSymbol(options.symbolHint || '');
  let metadata = {};

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    price = firstNumber(value, PRICE_KEYS);
    color = normalizeInputColor(value.color || value.colour || value.rgb);
    kind = stringValue(value.kind) || kind;
    id = stringValue(value.id || value.key);
    symbol = normalizeSymbol(firstString(value, SYMBOL_KEYS) || options.symbolHint || '');
    metadata = displayMetadata(value);
  }

  if (price == null) return null;
  return normalizeLevel(symbol, {
    id,
    symbol,
    name,
    price,
    kind,
    color,
    source: options.source || 'rocketscooter',
    capturedAt: options.capturedAt || '',
    metadata: withEndpointMetadata(metadata, options.endpointKey)
  });
}

function groupLevelsBySymbol(levels) {
  const grouped = {};
  levels.forEach((level) => {
    const symbol = normalizeSymbol(level.symbol);
    if (!grouped[symbol]) grouped[symbol] = [];
    grouped[symbol].push(level);
  });
  return grouped;
}

function detectSymbol(capture, body) {
  const haystack = [
    capture.symbol,
    capture.endpoint,
    capture.path,
    capture.url,
    JSON.stringify(shallowPick(body, SYMBOL_KEYS))
  ].map(stringValue).join(' ').toUpperCase();
  if (haystack.includes('NQ') || haystack.includes('QQQ')) return 'MNQ';
  if (haystack.includes('ES') || haystack.includes('SPY')) return 'MES';
  return '';
}

function walk(value, depth, visit) {
  if (depth > MAX_DEPTH || value == null) return;
  if (Array.isArray(value)) {
    visit(value);
    value.forEach((item) => walk(item, depth + 1, visit));
    return;
  }
  if (typeof value !== 'object') return;
  visit(value);
  Object.keys(value).forEach((key) => walk(value[key], depth + 1, visit));
}

function firstString(node, keys) {
  for (const key of keys) {
    if (node[key] != null && String(node[key]).trim()) return String(node[key]).trim();
  }
  return '';
}

function firstNumber(node, keys) {
  for (const key of keys) {
    const n = numberValue(node[key]);
    if (n != null) return n;
  }
  return null;
}

function firstArrayNumber(row, skipIndex) {
  for (let index = 0; index < row.length; index += 1) {
    if (index === skipIndex) continue;
    const value = numberValue(row[index]);
    if (value != null) return { index, value };
  }
  return null;
}

function looksLikeDisplayLevelName(name) {
  const text = stringValue(name).toUpperCase();
  if (!text) return false;
  return /(HP|MHP|DD|BZ|BRZ|YL|RL|OPEN|CLOSE|HIGH|GAP|LOW|ZONE)/.test(text);
}

function normalizeInputColor(value) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim().toUpperCase();
  if (Array.isArray(value) && value.length >= 3) return rgbToHex(value[0], value[1], value[2]);
  if (value && typeof value === 'object') {
    const r = value.r ?? value.red;
    const g = value.g ?? value.green;
    const b = value.b ?? value.blue;
    if ([r, g, b].every((part) => numberValue(part) != null)) return rgbToHex(r, g, b);
  }
  return '';
}

function colorFromArray(row, nameIndex, priceIndex) {
  const hex = row.find((item) => typeof item === 'string' && /^#[0-9a-f]{6}$/i.test(item.trim()));
  if (hex) return normalizeInputColor(hex);
  for (let index = 0; index <= row.length - 3; index += 1) {
    if ([index, index + 1, index + 2].includes(nameIndex) || [index, index + 1, index + 2].includes(priceIndex)) continue;
    const parts = [row[index], row[index + 1], row[index + 2]].map(colorByte);
    if (parts.every((part) => part != null)) return rgbToHex(parts[0], parts[1], parts[2]);
  }
  return '';
}

function explicitKind(row) {
  const allowed = new Set(['dd-band', 'hp', 'mhp', 'open-close', 'reference', 'zone', 'unknown']);
  return row.map(stringValue).find((value) => allowed.has(value.toLowerCase())) || '';
}

function rgbToHex(r, g, b) {
  const parts = [r, g, b].map((part) => {
    const n = Math.trunc(Math.max(0, Math.min(255, numberValue(part) ?? 0)));
    return n.toString(16).padStart(2, '0');
  });
  return `#${parts.join('')}`.toUpperCase();
}

function displayMetadata(node) {
  const out = {};
  ['source', 'type', 'group', 'side'].forEach((key) => {
    if (node[key] != null && typeof node[key] !== 'object') out[key] = node[key];
  });
  return out;
}

function withEndpointMetadata(metadata, endpointKey) {
  const key = stringValue(endpointKey);
  return key ? { ...metadata, endpointKey: key } : metadata;
}

function scrubEndpointKey(value) {
  const text = stringValue(value) || 'capture';
  return text.split('/').map(scrubEndpointSegment).join('/') || 'capture';
}

function scrubEndpointSegment(segment) {
  const text = stringValue(segment);
  if (!text) return segment;
  const upper = text.toUpperCase();
  if (upper.includes('MES') || upper.includes('MNQ') || upper === 'ES' || upper === 'NQ') return text;
  if (/^\d{4,}$/.test(text)) return ':id';
  if (/^[0-9a-f]{8,}$/i.test(text)) return ':id';
  if (/^[A-Za-z0-9_-]{20,}$/.test(text)) return ':id';
  return text;
}

function shallowPick(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  keys.forEach((key) => {
    if (value[key] != null) out[key] = value[key];
  });
  return out;
}

function integerOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function colorByte(value) {
  const n = numberValue(value);
  if (n == null || !Number.isInteger(n) || n < 0 || n > 255) return null;
  return n;
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/[$,\s]/g, '');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}

import {
  inferLevelKind,
  normalizeEndpointSummary,
  normalizeLevel,
  normalizeSymbol,
  stableLevelId
} from '../../schemas/src/index.js';

const MAX_DEPTH = 8;

const NAME_KEYS = ['name', 'label', 'text', 'title', 'caption', 'displayName', 'level', 'levelName', 'pivotName'];
const PRICE_KEYS = ['price', 'value', 'val', 'target', 'last', 'y', 'p', 'levelPrice', 'levelValue', 'pivotPrice'];
const SYMBOL_KEYS = [
  'symbol',
  'ticker',
  'root',
  'instrument',
  'contract',
  'contractSymbol',
  'cqgSymbol',
  'chartSymbol',
  'displaySymbol',
  'marketSymbol',
  'feedSymbol'
];
const ZONE_TOP_KEYS = ['top', 'upper', 'high', 'zoneTop', 'topPrice', 'upperPrice', 'highPrice'];
const ZONE_BOTTOM_KEYS = ['bottom', 'lower', 'low', 'zoneBottom', 'bottomPrice', 'lowerPrice', 'lowPrice'];

export function normalizeCapture(capture = {}) {
  const capturedAt = stringValue(capture.capturedAt) || new Date().toISOString();
  const key = endpointKey(capture);

  const warnings = [];
  const parsed = parseBody(capture.body, warnings);
  const symbolHint = detectSymbol(capture, parsed);
  const levels = collectLevels(parsed, {
    symbolHint,
    capturedAt,
    endpointKey: key,
    source: 'rocketscooter',
    warnings
  });

  if (!levels.length) {
    warnings.push('No display levels were recognized in this capture.');
  }

  const endpoint = normalizeEndpointSummary({
    key,
    url: stringValue(capture.url || capture.endpoint || capture.path),
    status: integerOrNull(capture.status),
    capturedAt,
    parser: 'generic-display-levels',
    ok: levels.length > 0
  });

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
  walk(root, 0, contextFromOptions(options), (node, context) => {
    if (!node || typeof node !== 'object') return;
    const candidateOptions = {
      ...options,
      symbolHint: context.symbolHint || options.symbolHint || '',
      zoneSide: context.zoneSide || options.zoneSide || '',
      nameHint: context.nameHint || ''
    };
    const candidates = Array.isArray(node) ? [candidateFromArray(node, candidateOptions)] : [
      ...candidatesFromZoneBounds(node, candidateOptions),
      candidateFromObject(node, candidateOptions),
      ...candidatesFromNamedPriceMap(node, candidateOptions)
    ];
    candidates.filter(Boolean).forEach((candidate) => {
      const id = candidate.id || stableLevelId(candidate.symbol, candidate);
      if (seen.has(id)) return;
      seen.add(id);
      levels.push({ ...candidate, id });
    });
  });
  return levels;
}

export function endpointKey(capture = {}) {
  const raw = stringValue(capture.endpoint || capture.path || capture.url || 'capture');
  return scrubEndpointKey(raw.replace(/^https?:\/\/[^/]+/i, '').split('?')[0] || 'capture');
}

function candidateFromObject(node, options) {
  const name = firstString(node, NAME_KEYS);
  const price = firstNumber(node, PRICE_KEYS);
  if (!name || price == null) return null;
  if (isBareQuoteFieldName(name)) return null;
  if (!looksLikeDisplayLevelName(name)) return null;
  const symbol = candidateSymbol(firstString(node, SYMBOL_KEYS) || options.symbolHint);
  if (!symbol) return null;
  return normalizeLevel(symbol, {
    id: stringValue(node.id || node.key),
    symbol,
    name,
    price,
    kind: levelKind(name, node.kind, displayMetadata(node), options),
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
  if (isBareQuoteFieldName(name)) return null;
  const priceInfo = firstArrayNumber(row, nameIndex);
  if (!priceInfo) return null;
  const symbol = candidateSymbol(options.symbolHint);
  if (!symbol) return null;
  return normalizeLevel(symbol, {
    symbol,
    name,
    price: priceInfo.value,
    kind: levelKind(name, explicitKind(row), {}, options),
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
    if (isBareQuoteFieldName(name)) continue;
    if (!looksLikeDisplayLevelName(name)) continue;
    const candidate = candidateFromNamedValue(name, rawValue, options);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

function candidatesFromZoneBounds(node, options) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
  const top = firstNumber(node, ZONE_TOP_KEYS);
  const bottom = firstNumber(node, ZONE_BOTTOM_KEYS);
  if (top == null || bottom == null) return [];

  const metadata = displayMetadata(node);
  const side = zoneSideFromText(
    [options.zoneSide, metadata.side, metadata.type, metadata.group, firstString(node, NAME_KEYS), options.nameHint]
      .map(stringValue)
      .filter(Boolean)
      .join(' ')
  );
  if (!side) return [];

  const symbol = candidateSymbol(firstString(node, SYMBOL_KEYS) || options.symbolHint);
  if (!symbol) return [];
  const suffix = zoneSuffix(node, options);
  const prefix = side === 'bear' ? 'BrZ' : 'BZ';
  const kind = side === 'bear' ? 'zone-bear' : 'zone-bull';
  const color = normalizeInputColor(node.color || node.colour || node.rgb);

  return [
    normalizeLevel(symbol, {
      id: stringValue(node.topId || node.upperId || node.highId),
      symbol,
      name: `${prefix}T${suffix}`,
      price: top,
      kind,
      color,
      source: options.source || 'rocketscooter',
      capturedAt: options.capturedAt || '',
      metadata: withEndpointMetadata({ ...metadata, side }, options.endpointKey)
    }),
    normalizeLevel(symbol, {
      id: stringValue(node.bottomId || node.lowerId || node.lowId),
      symbol,
      name: `${prefix}B${suffix}`,
      price: bottom,
      kind,
      color,
      source: options.source || 'rocketscooter',
      capturedAt: options.capturedAt || '',
      metadata: withEndpointMetadata({ ...metadata, side }, options.endpointKey)
    })
  ];
}

function candidateFromNamedValue(name, value, options) {
  let price = numberValue(value);
  let color = '';
  let kind = inferLevelKind(name);
  let id = '';
  let symbol = candidateSymbol(options.symbolHint);
  let metadata = {};

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    price = firstNumber(value, PRICE_KEYS);
    color = normalizeInputColor(value.color || value.colour || value.rgb);
    kind = levelKind(name, value.kind || kind, metadata, options);
    id = stringValue(value.id || value.key);
    symbol = candidateSymbol(firstString(value, SYMBOL_KEYS) || options.symbolHint);
    metadata = displayMetadata(value);
  }

  kind = levelKind(name, kind, metadata, options);
  if (price == null || !symbol) return null;
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
  const values = [
    capture.symbol,
    capture.endpoint,
    capture.path,
    capture.url,
    JSON.stringify(shallowPick(body, SYMBOL_KEYS))
  ];
  for (const value of values) {
    const symbol = detectedSymbol(value);
    if (symbol) return symbol;
  }
  return '';
}

function walk(value, depth, context, visit) {
  if (depth > MAX_DEPTH || value == null) return;
  if (Array.isArray(value)) {
    visit(value, context);
    value.forEach((item, index) => walk(item, depth + 1, contextFromKey(context, String(index)), visit));
    return;
  }
  if (typeof value !== 'object') return;
  visit(value, context);
  Object.keys(value).forEach((key) => walk(value[key], depth + 1, contextFromKey(context, key), visit));
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
  const allowed = new Set(['dd-band', 'hp', 'mhp', 'open-close', 'reference', 'zone', 'zone-bull', 'zone-bear', 'unknown']);
  return row.map(stringValue).find((value) => allowed.has(value.toLowerCase())) || '';
}

function levelKind(name, explicit, metadata = {}, options = {}) {
  const clean = stringValue(explicit).toLowerCase();
  if (clean === 'bull-zone') return 'zone-bull';
  if (clean === 'bear-zone') return 'zone-bear';
  if (clean === 'zone-bull' || clean === 'zone-bear') return clean;
  if (clean && clean !== 'zone') return clean;
  const side = zoneSideFromText([metadata.side, metadata.type, metadata.group, options.zoneSide, name].map(stringValue).join(' '));
  if (side === 'bull') return 'zone-bull';
  if (side === 'bear') return 'zone-bear';
  return clean || inferLevelKind(name);
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

function contextFromOptions(options = {}) {
  return {
    symbolHint: candidateSymbol(options.symbolHint),
    zoneSide: zoneSideFromText(options.zoneSide || ''),
    nameHint: stringValue(options.nameHint)
  };
}

function contextFromKey(context, key) {
  const text = stringValue(key);
  const symbol = symbolFromKey(text);
  const zoneSide = zoneSideFromText(text);
  return {
    symbolHint: symbol || context.symbolHint || '',
    zoneSide: zoneSide || context.zoneSide || '',
    nameHint: symbol || zoneSide ? context.nameHint || '' : text || context.nameHint || ''
  };
}

function symbolFromKey(key) {
  return detectedSymbol(key);
}

function detectedSymbol(value) {
  const raw = stringValue(value);
  if (!raw) return '';
  const normalized = normalizeSymbol(raw);
  const upper = raw.toUpperCase();
  if (normalized === 'MNQ' && (normalized !== upper || upper === 'MNQ' || upper === 'NQ')) return 'MNQ';
  if (normalized === 'MES' && (normalized !== upper || upper === 'MES' || upper === 'ES')) return 'MES';
  return '';
}

function candidateSymbol(value) {
  const raw = stringValue(value);
  if (!raw) return '';
  const symbol = normalizeSymbol(raw);
  return symbol === 'MES' || symbol === 'MNQ' ? symbol : '';
}

function isBareQuoteFieldName(name) {
  return /^(hp|mhp|open|close|high|low|last)$/i.test(stringValue(name));
}

function zoneSideFromText(value) {
  const text = stringValue(value).toUpperCase();
  if (!text) return '';
  if (text.includes('BEAR') || text.includes('SUPPLY') || text.includes('SELL') || text.includes('RESISTANCE') || text.includes('BRZ')) return 'bear';
  if (text.includes('BULL') || text.includes('DEMAND') || text.includes('BUY') || text.includes('SUPPORT') || /\bBZ/.test(text)) return 'bull';
  return '';
}

function zoneSuffix(node, options) {
  const raw = stringValue(node.index || node.number || node.id || node.key || options.nameHint);
  const match = raw.match(/\d+/);
  return match ? match[0] : '';
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

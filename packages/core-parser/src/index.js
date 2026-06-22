import {
  inferLevelKind,
  normalizeEndpointSummary,
  normalizeLevel,
  normalizeStats,
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
  'feedSymbol',
  'chart',
  'index'
];
const COLOR_KEYS = ['color', 'colour', 'rgb', 'linecolor', 'lineColor', 'textcolor', 'textColor', 'backgroundColor'];
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
  const stats = collectStats(parsed, { symbolHint });

  if (!levels.length && !Object.keys(stats).length) {
    warnings.push('No display levels were recognized in this capture.');
  }

  const endpoint = normalizeEndpointSummary({
    key,
    url: stringValue(capture.url || capture.endpoint || capture.path),
    status: integerOrNull(capture.status),
    capturedAt,
    parser: 'generic-display-levels',
    ok: levels.length > 0 || Object.keys(stats).length > 0
  });

  return {
    endpoint,
    capturedAt,
    symbols: groupLevelsBySymbol(levels),
    stats,
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
    if (context.ignore) return;
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

export function collectStats(root, options = {}) {
  const grouped = {};
  const merge = (symbolInput, statsInput) => {
    const symbol = candidateSymbol(symbolInput || options.symbolHint);
    if (!symbol || !statsInput || typeof statsInput !== 'object' || Array.isArray(statsInput)) return;
    const normalized = normalizeStats(statsInput);
    if (!hasMeaningfulStats(normalized)) return;
    grouped[symbol] = mergeStatsValues(grouped[symbol], normalized);
  };

  visitStats(root, '', merge, options);
  return grouped;
}

export function endpointKey(capture = {}) {
  const raw = stringValue(capture.endpoint || capture.path || capture.url || 'capture');
  return scrubEndpointKey(raw.replace(/^https?:\/\/[^/]+/i, '').split('?')[0] || 'capture');
}

function visitStats(value, keyHint, merge, options) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      if (looksLikeStatsNode(entry)) merge(candidateSymbolFromStatsNode(entry, keyHint || options.symbolHint), entry);
      visitStats(entry, keyHint, merge, options);
    });
    return;
  }

  const nodeSymbol = candidateSymbolFromStatsNode(value, options.symbolHint || keyHint);
  if (value.stats && typeof value.stats === 'object') {
    mergeStatsContainer(value.stats, nodeSymbol || keyHint || options.symbolHint, merge, options);
  }
  if (value.headerBar && typeof value.headerBar === 'object' && !Array.isArray(value.headerBar)) {
    mergeHeaderBarStats(value.headerBar, merge);
  }
  if (value.mapCodes && typeof value.mapCodes === 'object' && !Array.isArray(value.mapCodes)) {
    mergeMapCodeStats(value.mapCodes, merge);
  }
  if (looksLikeStatsNode(value)) {
    merge(nodeSymbol || keyHint || options.symbolHint, value);
  }

  for (const [key, child] of Object.entries(value)) {
    if (!child || typeof child !== 'object') continue;
    if (['levels', 'chartLines', 'referenceLines', 'zoneRectangles'].includes(key)) continue;
    if (Array.isArray(child)) {
      visitStats(child, keyHint, merge, options);
      continue;
    }
    const symbol = symbolFromStatsKey(key);
    if (symbol) {
      if (looksLikeStatsNode(child)) merge(symbol, child);
      visitStats(child, symbol, merge, options);
    } else {
      visitStats(child, keyHint, merge, options);
    }
  }
}

function mergeStatsContainer(container, keyHint, merge, options) {
  if (Array.isArray(container)) {
    container.forEach((entry) => merge(candidateSymbolFromStatsNode(entry, keyHint || options.symbolHint), entry));
    return;
  }

  const directSymbol = candidateSymbolFromStatsNode(container, keyHint || options.symbolHint);
  if (looksLikeStatsNode(container) && directSymbol) merge(directSymbol, container);

  Object.entries(container).forEach(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const symbol = symbolFromStatsKey(key) || candidateSymbolFromStatsNode(value, keyHint || options.symbolHint);
    if (symbol) merge(symbol, value);
  });
}

function mergeHeaderBarStats(headerBar, merge) {
  const sp = headerBar.sp500 || headerBar.SP500 || headerBar.spx || headerBar.SPX || headerBar.es || headerBar.ES;
  const nq = headerBar.nq100 || headerBar.NQ100 || headerBar.ndx || headerBar.NDX || headerBar.nq || headerBar.NQ;
  const spStats = normalizeStats(sp || {});
  if (hasMeaningfulStats(spStats)) merge('MES', spStats);
  if (nq && typeof nq === 'object') {
    const nqStats = normalizeStats({
      ...(spStats.dd == null ? {} : { dd: spStats.dd }),
      ...nq
    });
    if (hasMeaningfulStats(nqStats)) merge('MNQ', nqStats);
  }
}

function mergeMapCodeStats(mapCodes, merge) {
  Object.entries(mapCodes).forEach(([key, value]) => {
    const symbol = mapCodeSymbol(key);
    if (!symbol || !value || typeof value !== 'object' || Array.isArray(value)) return;
    const mapCode = mapCodeFromNode(value);
    if (mapCode) merge(symbol, { mapCode });
  });
}

function mapCodeSymbol(value) {
  const key = stringValue(value).toUpperCase();
  if (key === 'SPY' || key === 'SPX' || key === 'SP500') return 'MES';
  if (key === 'QQQ' || key === 'NDX' || key === 'NQ100') return 'MNQ';
  return candidateSymbol(key);
}

function symbolFromStatsKey(value) {
  const key = stringValue(value);
  if (/^(sp500|spx|spy)$/i.test(key)) return 'MES';
  if (/^(nq100|ndx|qqq)$/i.test(key)) return 'MNQ';
  return candidateSymbol(key);
}

function candidateSymbolFromStatsNode(node, fallback = '') {
  if (!node || typeof node !== 'object') return candidateSymbol(fallback);
  return candidateSymbol(firstString(node, SYMBOL_KEYS)) || candidateSymbol(fallback);
}

function looksLikeStatsNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (mapCodeFromNode(node)) return true;
  return [
    node.dd,
    node.ddRatio,
    node.riskInterval,
    node.ri,
    node.RI,
    node.risk,
    node.riskInt,
    node['Risk Interval'],
    node.resilience,
    node.res,
    node.dailyResilience,
    node.weeklyResilience,
    node.wres,
    node.resilience3,
    node.monthlyResilience,
    node.mres,
    node.resilience2
  ].some((value) => numberValue(value) != null);
}

function hasMeaningfulStats(stats = {}) {
  return Boolean(stats.mapCode) ||
    [stats.dd, stats.riskInterval, stats.resilience, stats.weeklyResilience, stats.monthlyResilience]
      .some((value) => value != null && Number.isFinite(Number(value)));
}

function mergeStatsValues(existing = {}, next = {}) {
  const merged = normalizeStats(existing);
  ['dd', 'riskInterval', 'resilience', 'weeklyResilience', 'monthlyResilience'].forEach((key) => {
    if (next[key] != null && Number.isFinite(Number(next[key]))) merged[key] = Number(next[key]);
  });
  if (next.mapCode) merged.mapCode = next.mapCode;
  return merged;
}

function mapCodeFromNode(node) {
  if (!node || typeof node !== 'object') return '';
  const direct = stringValue(node.mapCode || node.map || node.liquidityMap || node.code);
  if (direct) return direct;
  return [node.BBrMr, node.zone, node.LS, node.hedging, node.UD, node.timePressure]
    .map(stringValue)
    .filter(Boolean)
    .join('');
}

function candidateFromObject(node, options) {
  const name = firstDisplayLevelName(node);
  const price = firstNumber(node, PRICE_KEYS);
  if (!name || price == null) return null;
  if (isBareQuoteFieldName(name)) return null;
  if (!looksLikeDisplayLevelName(name)) return null;
  const symbol = candidateSymbolFromNode(node, options);
  if (!symbol) return null;
  return normalizeLevel(symbol, {
    id: stringValue(node.id || node.key),
    symbol,
    name,
    price,
    kind: levelKind(name, node.kind, displayMetadata(node), options),
    color: inputColor(node),
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
    [options.zoneSide, metadata.side, metadata.type, metadata.group, displayNameText(node), options.nameHint]
      .map(stringValue)
      .filter(Boolean)
      .join(' ')
  );
  if (!side) return [];

  const symbol = candidateSymbolFromNode(node, options);
  if (!symbol) return [];
  const suffix = zoneSuffix(node, options);
  const prefix = side === 'bear' ? 'BrZ' : 'BZ';
  const kind = side === 'bear' ? 'zone-bear' : 'zone-bull';
  const color = inputColor(node);

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
    color = inputColor(value);
    kind = levelKind(name, value.kind || kind, metadata, options);
    id = stringValue(value.id || value.key);
    symbol = candidateSymbolFromNode(value, options);
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
  const nodeContext = contextFromNode(context, value);
  visit(value, nodeContext);
  Object.keys(value).forEach((key) => walk(value[key], depth + 1, contextFromKey(nodeContext, key), visit));
}

function firstString(node, keys) {
  return valuesForKeys(node, keys)[0] || '';
}

function valuesForKeys(node, keys) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
  const values = [];
  for (const key of keys) {
    if (node[key] != null && String(node[key]).trim()) values.push(String(node[key]).trim());
  }
  const seenKeys = new Set(keys);
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, value] of Object.entries(node)) {
    if (seenKeys.has(key) || !lowerKeys.has(key.toLowerCase())) continue;
    if (value != null && String(value).trim()) values.push(String(value).trim());
  }
  return values;
}

function firstDisplayLevelName(node) {
  for (const key of NAME_KEYS) {
    const value = stringValue(node[key]);
    if (!value || isBareQuoteFieldName(value)) continue;
    if (looksLikeDisplayLevelName(value)) return value;
  }
  return manualLevelNameFromColor(inputColor(node));
}

function manualLevelNameFromColor(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return '';
  if (isPurple(rgb)) return 'CAT';
  if (isYellow(rgb)) return 'Yellow Line';
  if (isRed(rgb)) return 'Red Line';
  return '';
}

function displayNameText(node) {
  return NAME_KEYS.map((key) => stringValue(node[key])).filter(Boolean).join(' ');
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
  return /(HP|MHP|DD|BZ|BRZ|CAT|YL\d*|RL\d*|YELLOW\s*LINE|RED\s*LINE|OPEN|CLOSE|HIGH|GAP|LOW|ZONE)/.test(text);
}

function normalizeInputColor(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase();
    const hex = text.match(/^#?([0-9a-f]{6})$/i);
    if (hex) return `#${hex[1]}`.toUpperCase();
    const rgb = text.match(/rgba?\s*\(\s*([.\d]+)\s*,\s*([.\d]+)\s*,\s*([.\d]+)/i);
    if (rgb) return rgbToHex(rgb[1], rgb[2], rgb[3]);
    const named = text.toLowerCase();
    if (named === 'yellow') return '#FFEB3B';
    if (named === 'red') return '#F23645';
    if (named === 'purple') return '#7E57C2';
  }
  if (Array.isArray(value) && value.length >= 3) return rgbToHex(value[0], value[1], value[2]);
  if (value && typeof value === 'object') {
    const r = value.r ?? value.red;
    const g = value.g ?? value.green;
    const b = value.b ?? value.blue;
    if ([r, g, b].every((part) => numberValue(part) != null)) return rgbToHex(r, g, b);
  }
  return '';
}

function inputColor(node = {}) {
  for (const key of COLOR_KEYS) {
    const color = normalizeInputColor(node[key]);
    if (color) return color;
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
  const allowed = new Set(['dd-band', 'hp', 'mhp', 'open-close', 'reference', 'yellow-line', 'red-line', 'cat', 'zone', 'zone-bull', 'zone-bear', 'unknown']);
  return row.map((value) => canonicalLevelKind(value)).find((value) => allowed.has(value)) || '';
}

function levelKind(name, explicit, metadata = {}, options = {}) {
  const clean = canonicalLevelKind(explicit);
  const inferred = inferLevelKind(name);
  if (shouldUseInferredKind(clean, inferred)) return inferred;
  if (clean === 'zone-bull' || clean === 'zone-bear') return clean;
  if (clean && clean !== 'zone') return clean;
  const side = zoneSideFromText([metadata.side, metadata.type, metadata.group, options.zoneSide, name].map(stringValue).join(' '));
  if (side === 'bull') return 'zone-bull';
  if (side === 'bear') return 'zone-bear';
  return clean || inferred;
}

function canonicalLevelKind(value) {
  const raw = stringValue(value).toLowerCase();
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

function shouldUseInferredKind(explicitKind, inferredKind) {
  if (!inferredKind || inferredKind === 'unknown') return false;
  if (!explicitKind) return true;
  if (isZoneSideKind(inferredKind) && (explicitKind === 'zone' || explicitKind === 'unknown' || isZoneSideKind(explicitKind))) return inferredKind !== explicitKind;
  return ['yellow-line', 'red-line', 'cat'].includes(inferredKind) &&
    ['reference', 'unknown', 'open-close'].includes(explicitKind);
}

function isZoneSideKind(kind) {
  return kind === 'zone-bull' || kind === 'zone-bear';
}

function rgbToHex(r, g, b) {
  const parts = [r, g, b].map((part) => {
    const n = Math.trunc(Math.max(0, Math.min(255, numberValue(part) ?? 0)));
    return n.toString(16).padStart(2, '0');
  });
  return `#${parts.join('')}`.toUpperCase();
}

function hexToRgb(hex) {
  const clean = stringValue(hex).replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
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

function displayMetadata(node) {
  const out = {};
  ['source', 'type', 'group', 'side', 'chart', 'index', 'label', 'reader'].forEach((key) => {
    if (node[key] != null && typeof node[key] !== 'object') out[key] = node[key];
  });
  return out;
}

function contextFromOptions(options = {}) {
  return {
    symbolHint: candidateSymbol(options.symbolHint),
    zoneSide: zoneSideFromText(options.zoneSide || ''),
    nameHint: stringValue(options.nameHint),
    ignore: false,
    quoteContext: false
  };
}

function contextFromKey(context, key) {
  const text = stringValue(key);
  const symbol = symbolFromKey(text);
  const quoteContext = context.quoteContext || isQuoteContextKey(text);
  const statsContext = isStatsContextKey(text);
  const unsupportedSymbol = !symbol && isUnsupportedSymbolContext(text);
  const zoneSide = zoneSideFromText(text);
  return {
    symbolHint: unsupportedSymbol ? '' : symbol || context.symbolHint || '',
    zoneSide: zoneSide || context.zoneSide || '',
    nameHint: symbol || zoneSide || unsupportedSymbol ? context.nameHint || '' : text || context.nameHint || '',
    ignore: context.ignore || quoteContext || statsContext || unsupportedSymbol,
    quoteContext
  };
}

function contextFromNode(context, node) {
  const rawSymbol = firstString(node, SYMBOL_KEYS);
  if (!rawSymbol) return context;
  const symbol = detectedSymbol(rawSymbol);
  if (symbol) {
    return {
      ...context,
      symbolHint: symbol,
      ignore: context.quoteContext
    };
  }
  if (isUnsupportedSymbolContext(rawSymbol)) {
    return {
      ...context,
      symbolHint: '',
      ignore: true
    };
  }
  return context;
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

function candidateSymbolFromNode(node, options = {}) {
  let sawUnsupportedSymbol = false;
  for (const raw of valuesForKeys(node, SYMBOL_KEYS)) {
    const symbol = candidateSymbol(raw);
    if (symbol) return symbol;
    if (isUnsupportedSymbolContext(raw)) sawUnsupportedSymbol = true;
  }
  return sawUnsupportedSymbol ? '' : candidateSymbol(options.symbolHint);
}

function isQuoteContextKey(key) {
  return /(watchlist|quote|quotes|ticker|screener|scanner)/i.test(stringValue(key));
}

function isStatsContextKey(key) {
  return /^(stats|headerBar|mapCodes)$/i.test(stringValue(key));
}

function isUnsupportedSymbolContext(value) {
  const text = stringValue(value);
  if (!text || candidateSymbol(text) || looksLikeDisplayLevelName(text)) return false;
  if (/^F\.US\./i.test(text)) return true;
  return text.split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .some((part) => /^[A-Z]{1,6}$/.test(part) && !NON_SYMBOL_CONTEXT_PARTS.has(part));
}

const NON_SYMBOL_CONTEXT_PARTS = new Set(['API', 'CME', 'CQG', 'F', 'ID', 'RS', 'TV', 'URL', 'US', 'USD']);

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
  const values = [node.number, node.zoneIndex, node.id, node.key, node.index];
  for (const value of values) {
    const raw = stringValue(value);
    const match = raw.match(/\d+/);
    if (match) return match[0];
  }
  const rawHint = stringValue(options.nameHint);
  if (/^\d+$/.test(rawHint)) return String(Number(rawHint) + 1);
  const hintMatch = rawHint.match(/\d+/);
  return hintMatch ? hintMatch[0] : '';
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

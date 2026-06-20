import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferLevelKind,
  normalizeEndpointSummary,
  normalizeLevel,
  normalizeSymbol,
  normalizeSymbolSnapshot,
  stableLevelId,
  validateSnapshot
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(__dirname, '..', 'examples', 'snapshot.sample.json');
const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

const result = validateSnapshot(sample);
assert.equal(result.ok, true, result.errors.join('\n'));
assert.equal(Object.hasOwn(sample.source.endpoints[0], 'url'), false);

assert.equal(inferLevelKind('OVNHP'), 'hp');
assert.equal(inferLevelKind('DD Upper'), 'dd-band');
assert.equal(inferLevelKind('QQQ Open'), 'open-close');
assert.equal(inferLevelKind('BZT2'), 'zone-bull');
assert.equal(inferLevelKind('BrZT2'), 'zone-bear');

const normalized = normalizeLevel('NQ', {
  name: 'RL',
  price: '30272.75',
  color: '#f23645'
});
assert.equal(normalized.symbol, 'MNQ');
assert.equal(normalized.price, 30272.75);
assert.equal(normalized.kind, 'reference');
assert.equal(normalized.color, '#F23645');

const endpoint = normalizeEndpointSummary({
  key: '/platform/api/v1/ddbands/MES',
  url: 'https://example.test/platform/api/v1/ddbands/MES?private=value',
  status: 200
});
assert.equal(endpoint.key, '/platform/api/v1/ddbands/MES');
assert.equal(Object.hasOwn(endpoint, 'url'), false);

const symbolSnapshot = normalizeSymbolSnapshot('ES', {
  displaySymbol: 'ES/MES',
  levels: [{ name: 'HP', price: 7500 }]
});
assert.equal(symbolSnapshot.symbol, 'MES');
assert.equal(symbolSnapshot.levels[0].id, stableLevelId('MES', { name: 'HP', price: 7500 }));

assert.equal(normalizeSymbol('F.US.EPU26'), 'MES');
assert.equal(normalizeSymbol('EPU26'), 'MES');
assert.equal(normalizeSymbol('EP'), 'MES');
assert.equal(normalizeSymbol('E-Mini S&P 500: September 2026'), 'MES');
assert.equal(normalizeSymbol('F.US.ENQU26'), 'MNQ');
assert.equal(normalizeSymbol('ENQU26'), 'MNQ');
assert.equal(normalizeSymbol('ENQ'), 'MNQ');
assert.equal(normalizeSymbol('E-mini NASDAQ-100: September 2026'), 'MNQ');
assert.equal(normalizeSymbol('SPY'), 'SPY');
assert.equal(normalizeSymbol('QQQ'), 'QQQ');
assert.equal(normalizeSymbol('levels'), 'LEVELS');
assert.equal(normalizeSymbol('messages'), 'MESSAGES');

console.log('schema sample validation passed');

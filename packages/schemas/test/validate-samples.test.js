import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferLevelKind,
  normalizeEndpointSummary,
  normalizeLevel,
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
assert.equal(inferLevelKind('BrZT2'), 'zone');

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

console.log('schema sample validation passed');

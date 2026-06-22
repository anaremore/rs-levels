import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferLevelKind,
  normalizeEndpointSummary,
  normalizeLevel,
  normalizeStats,
  displaySymbolFor,
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
assert.equal(inferLevelKind('YL'), 'yellow-line');
assert.equal(inferLevelKind('Red Line'), 'red-line');
assert.equal(inferLevelKind('CAT'), 'cat');

const normalized = normalizeLevel('NQ', {
  name: 'RL',
  price: '30272.75',
  color: '#f23645'
});
assert.equal(normalized.symbol, 'MNQ');
assert.equal(normalized.price, 30272.75);
assert.equal(normalized.kind, 'red-line');
assert.equal(normalized.color, '#F23645');

assert.equal(normalizeLevel('NQ', { name: 'Red Line', price: 30182, kind: 'unknown' }).kind, 'red-line');
assert.equal(normalizeLevel('NQ', { name: 'Yellow Line', price: 30979, kind: 'reference' }).kind, 'yellow-line');
assert.equal(normalizeLevel('NQ', { name: 'CAT', price: 31232.74, kind: 'open-close' }).kind, 'cat');
assert.equal(normalizeStats({ RI: '68.75' }).riskInterval, 68.75);
assert.equal(normalizeStats({ 'Risk Interval': 266.25 }).riskInterval, 266.25);

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
assert.equal(normalizeSymbol('F.US.EPU'), 'MES');
assert.equal(normalizeSymbol('F.US.EPZ26'), 'MES');
assert.equal(normalizeSymbol('F.US.EPH27'), 'MES');
assert.equal(normalizeSymbol('MESH27'), 'MES');
assert.equal(normalizeSymbol('ESU'), 'MES');
assert.equal(normalizeSymbol('EPU26'), 'MES');
assert.equal(normalizeSymbol('EP'), 'MES');
assert.equal(normalizeSymbol('E-Mini S&P 500: September 2026'), 'MES');
assert.equal(normalizeSymbol('F.US.ENQU26'), 'MNQ');
assert.equal(normalizeSymbol('F.US.ENQU'), 'MNQ');
assert.equal(normalizeSymbol('F.US.ENQZ26'), 'MNQ');
assert.equal(normalizeSymbol('F.US.ENQH27'), 'MNQ');
assert.equal(normalizeSymbol('MNQH27'), 'MNQ');
assert.equal(normalizeSymbol('NQU'), 'MNQ');
assert.equal(normalizeSymbol('ENQU26'), 'MNQ');
assert.equal(normalizeSymbol('ENQ'), 'MNQ');
assert.equal(normalizeSymbol('E-mini NASDAQ-100: September 2026'), 'MNQ');
assert.equal(normalizeSymbol('SPY'), 'SPY');
assert.equal(normalizeSymbol('QQQ'), 'QQQ');
assert.equal(normalizeSymbol('levels'), 'LEVELS');
assert.equal(normalizeSymbol('messages'), 'MESSAGES');
assert.equal(displaySymbolFor('MES'), 'ES');
assert.equal(displaySymbolFor('ES'), 'ES');
assert.equal(displaySymbolFor('F.US.EPU26'), 'ES');
assert.equal(displaySymbolFor('MNQ'), 'NQ');
assert.equal(displaySymbolFor('NQ'), 'NQ');
assert.equal(displaySymbolFor('F.US.ENQU26'), 'NQ');
assert.equal(displaySymbolFor('SPY'), 'SPY');

console.log('schema sample validation passed');

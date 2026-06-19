import assert from 'node:assert/strict';
import { collectLevels, normalizeCapture } from '../src/index.js';

const body = {
  symbol: 'MES',
  levels: [
    { name: 'OVNHP', price: '7537.00', color: [41, 98, 255] },
    { label: 'DD Upper', value: 7579.75, color: '#29b6f6' },
    { label: 'Not a level', value: 123 }
  ]
};

const parsed = normalizeCapture({
  endpoint: '/platform/api/v1/ddbands/MES',
  status: 200,
  capturedAt: '2026-06-19T14:29:59.500Z',
  body
});

assert.equal(parsed.endpoint.key, '/platform/api/v1/ddbands/MES');
assert.equal(parsed.symbols.MES.length, 2);
assert.equal(parsed.symbols.MES[0].name, 'OVNHP');
assert.equal(parsed.symbols.MES[0].color, '#2962FF');
assert.equal(parsed.symbols.MES[1].kind, 'dd-band');

const nested = collectLevels({ data: { rows: [{ pivotName: 'QQQ Open', pivotPrice: 30812.5 }] } }, {
  symbolHint: 'MNQ',
  capturedAt: '2026-06-19T14:29:59.500Z'
});
assert.equal(nested.length, 1);
assert.equal(nested[0].symbol, 'MNQ');
assert.equal(nested[0].kind, 'open-close');

console.log('core parser tests passed');


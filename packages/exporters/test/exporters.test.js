import assert from 'node:assert/strict';
import { createTradingViewJsonExport, createTradingViewPayload } from '../src/index.js';

const row = {
  symbol: 'ES',
  capturedAt: '2026-06-19T14:29:59.500Z',
  levels: [
    { name: 'OVNHP', price: 7537, kind: 'hp', color: '#2962FF' },
    { name: 'DD Upper; bad|chars', price: 7579.75, kind: 'dd-band', color: '#29B6F6' }
  ]
};

const payload = createTradingViewPayload(row);
assert.equal(payload, 'RSLEVELS|1|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp;DD Upper bad chars,7579.75,dd-band');

const json = createTradingViewJsonExport(row, { generatedAt: '2026-06-19T14:30:00.000Z' });
assert.equal(json.schemaVersion, '0.1.0');
assert.equal(json.exportFormat, 'tradingview-json');
assert.equal(json.payloadVersion, 1);
assert.equal(json.symbol, 'MES');
assert.equal(json.compactPayload, payload);
assert.equal(json.levels.length, 2);
assert.equal(json.levels[1].color, '#29B6F6');

console.log('exporter tests passed');

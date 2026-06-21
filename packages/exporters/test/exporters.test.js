import assert from 'node:assert/strict';
import {
  createTradingViewBundleJsonExport,
  createTradingViewBundlePayload,
  createTradingViewJsonExport,
  createTradingViewPayload
} from '../src/index.js';

const row = {
  symbol: 'ES',
  capturedAt: '2026-06-19T14:29:59.500Z',
  levels: [
    { name: 'OVNHP', price: 7537, kind: 'hp', color: '#2962FF' },
    { name: 'DD Upper; bad|chars', price: 7579.75, kind: 'dd-band', color: '#29B6F6' },
    { name: 'BZT1', price: 7588, kind: 'zone-bull', color: '#4CAF50' },
    { name: 'BrZT1', price: 7612, kind: 'zone-bear', color: '#F06292' },
    { name: 'text SPY Open : 7,559 Liquidity Map', price: 7559, kind: 'open-close', color: '#E0E0E0' }
  ]
};

const payload = createTradingViewPayload(row);
assert.equal(payload, 'RSLEVELS|1|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp;DD Upper bad chars,7579.75,dd-band;BZT1,7588.00,zone-bull;BrZT1,7612.00,zone-bear;Open,7559.00,open-close');

const json = createTradingViewJsonExport(row, { generatedAt: '2026-06-19T14:30:00.000Z' });
assert.equal(json.schemaVersion, '0.1.0');
assert.equal(json.exportFormat, 'tradingview-json');
assert.equal(json.payloadVersion, 1);
assert.equal(json.symbol, 'MES');
assert.equal(json.compactPayload, payload);
assert.equal(json.levels.length, 5);
assert.equal(json.levels[1].color, '#29B6F6');
assert.equal(json.levels[2].kind, 'zone-bull');
assert.equal(json.levels[3].kind, 'zone-bear');
assert.equal(json.levels[4].name, 'Open');

const manyLevels = {
  symbol: 'MES',
  capturedAt: '2026-06-19T14:29:59.500Z',
  levels: Array.from({ length: 120 }, (_item, index) => ({
    name: `BZT${index + 1}`,
    price: 7500 + index,
    kind: 'zone-bull'
  }))
};
assert.equal(createTradingViewJsonExport(manyLevels).levels.length, 120);
assert.equal(createTradingViewPayload(manyLevels).split(';').length, 120);
assert.equal(createTradingViewPayload(manyLevels, { maxLevels: 10 }).split(';').length, 10);

const bundleSnapshot = {
  generatedAt: '2026-06-19T14:31:00.000Z',
  symbols: {
    MNQ: {
      symbol: 'MNQ',
      capturedAt: '2026-06-19T14:30:30.000Z',
      levels: [{ name: 'BrZT1', price: 30450, kind: 'zone-bear', color: '#F06292' }]
    },
    MES: row,
    SPY: {
      symbol: 'SPY',
      capturedAt: '2026-06-19T14:30:30.000Z',
      levels: [{ name: 'PrevDayClose', price: 740.96, kind: 'open-close' }]
    },
    QQQ: {
      symbol: 'QQQ',
      capturedAt: '2026-06-19T14:30:30.000Z',
      levels: [{ name: 'LastOpen', price: 747.76, kind: 'open-close' }]
    }
  }
};
const bundlePayload = createTradingViewBundlePayload(bundleSnapshot);
assert.equal(bundlePayload, 'RSLEVELS|2|2026-06-19T14:31:00.000Z|MES|2026-06-19T14:29:59.500Z|OVNHP,7537.00,hp;DD Upper bad chars,7579.75,dd-band;BZT1,7588.00,zone-bull;BrZT1,7612.00,zone-bear;Open,7559.00,open-close|MNQ|2026-06-19T14:30:30.000Z|BrZT1,30450.00,zone-bear');
assert.equal(bundlePayload.includes('|SPY|'), false);
assert.equal(bundlePayload.includes('|QQQ|'), false);

const bundleJson = createTradingViewBundleJsonExport(bundleSnapshot, { generatedAt: '2026-06-19T14:31:05.000Z' });
assert.equal(bundleJson.exportFormat, 'tradingview-bundle-json');
assert.equal(bundleJson.payloadVersion, 2);
assert.equal(bundleJson.compactPayload, createTradingViewBundlePayload(bundleSnapshot, { generatedAt: '2026-06-19T14:31:05.000Z' }));
assert.deepEqual(bundleJson.symbols.map((symbol) => symbol.symbol), ['MES', 'MNQ']);
assert.equal(bundleJson.symbols[0].levelCount, 5);
assert.equal(bundleJson.symbols[1].levels[0].kind, 'zone-bear');
assert.match(createTradingViewBundlePayload(bundleSnapshot, { symbol: 'MES' }), /\|MNQ\|/);

console.log('exporter tests passed');
